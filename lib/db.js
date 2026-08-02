/**
 * 数据库连接 + Schema 初始化
 *
 * - 使用 better-sqlite3（同步 API，最快）
 * - 数据库文件位于 ctx.dataDir（即 plugin-data 目录，卸载插件不丢）
 * - Schema 首次启动自动建表，后续启动幂等
 * - 所有写入走事务，保证原子性
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// better-sqlite3 作为 CJS 包嵌入 vendor（ABI 需与 Hana host 的 Node 版本一致）。
// community 槽位部署时同步 Hana host 的 better-sqlite3@12.6.2；
// dev 槽位部署时可用本地 npm rebuild 出来的版本。
// 注意：必须用 fileURLToPath 而不是 new URL().pathname，
// 后者在 Windows 上会得到 \C:\... 形式的无效路径，导致 existsSync 恒为 false。
const __dirname_db = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.join(__dirname_db, "vendor", "better-sqlite3");
const VENDOR_ENTRY = path.join(VENDOR_DIR, "lib", "index.js");
const VENDOR_NATIVE = path.join(VENDOR_DIR, "build", "Release", "better_sqlite3.node");

const HAVE_VENDOR = fs.existsSync(VENDOR_ENTRY);

let Database;
if (HAVE_VENDOR) {
  // vendor 是 CJS，用 createRequire 加载，让内部 require('bindings') 正常工作
  const vendorRequire = createRequire(VENDOR_ENTRY);
  Database = vendorRequire(VENDOR_ENTRY);
} else {
  // 回退：依赖 Hana host 的 bare import
  Database = (await import("better-sqlite3")).default;
}

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  members TEXT DEFAULT '[]',
  plan_start TEXT,
  plan_end TEXT,
  status TEXT NOT NULL DEFAULT '待开始',
  project_set_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_set_id) REFERENCES project_sets(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_set ON projects(project_set_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_task_id TEXT,
  index_num INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);

CREATE TABLE IF NOT EXISTS task_file_refs (
  task_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  PRIMARY KEY (task_id, file_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tfr_file ON task_file_refs(file_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  content TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_annotations_task ON annotations(task_id);
`;

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "projects.sqlite");
  const db = HAVE_VENDOR ? new Database(dbPath, { nativeBinding: VENDOR_NATIVE }) : new Database(dbPath);

  // 性能与安全配置
  db.pragma("journal_mode = WAL");       // 写并发 + 崩溃恢复
  db.pragma("foreign_keys = ON");        // 启用外键约束
  db.pragma("synchronous = NORMAL");     // WAL 模式下安全

  // 初始化 schema
  db.exec(SCHEMA_SQL);

  // 记录 schema 版本（用于未来迁移）
  const version = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get();
  if (!version) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)").run(String(SCHEMA_VERSION));
  }

  return db;
}

// ===== 通用工具 =====

export function shortId() {
  // 8 字符短 id，UUID 截断
  return crypto.randomUUID().slice(0, 8);
}

/**
 * 同步事务包装
 * @param {Database} db
 * @param {Function} fn 同步函数，接收 db 参数
 */
export function tx(db, fn) {
  return db.transaction(fn)(db);
}