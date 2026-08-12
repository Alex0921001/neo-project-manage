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

const SCHEMA_VERSION = 7;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sort INTEGER
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
  session_ids TEXT DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_set_id) REFERENCES project_sets(id) ON DELETE SET NULL
);
-- 注：idx_projects_pinned 依赖 v7 新列，老库执行会报错，统一放在迁移函数中创建（新库也会走一次，幂等）。
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
  assignees TEXT,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
-- 注：idx_tasks_assignees / idx_tasks_dates 依赖 v2 新列，老库执行会报错，
-- 统一放在迁移函数中创建（新库也会走一次，幂等）。

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT,
  size INTEGER,
  ext TEXT,
  indexed INTEGER DEFAULT 0,
  digest TEXT,
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
  kind TEXT DEFAULT 'note',
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_annotations_task ON annotations(task_id);

CREATE TABLE IF NOT EXISTS project_summaries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_summaries_project ON project_summaries(project_id);
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

  // 记录 schema 版本（用于未来迁移）；新库（无版本）也走一次迁移，保证索引与版本号一致
  const versionRow = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get();
  if (!versionRow || Number(versionRow.value) < SCHEMA_VERSION) {
    migrateToV3(db);
    migrateToV4(db);
    migrateToV5(db);
    migrateToV6(db);
    migrateToV7(db);
  }

  return db;
}

/**
 * Schema 迁移到 v3（幂等，兼容 v1 / v2 老库与全新库）
 *
 * v1 → v3：tasks 表新增 assignees / start_date / end_date 三列 + 索引
 * v2 → v3：assignee 列改名 assignees（dev slot 阶段 v2 库直接 DROP + ADD）
 * v3：新库 SCHEMA_SQL 已含全列，本函数仅补齐索引与版本号
 *
 * @param {Database} db
 */
export function migrateToV3(db) {
  const cols = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  // 先清旧索引再删列（P1-1：SQLite 不允许 DROP COLUMN 依赖索引的列）
  db.exec("DROP INDEX IF EXISTS idx_tasks_assignee");
  // v2 dev 库：旧单值列删除（未发布，无需迁移数据）
  if (cols.includes("assignee") && !cols.includes("assignees")) {
    db.exec("ALTER TABLE tasks DROP COLUMN assignee");
  }
  if (!cols.includes("assignees")) {
    db.exec("ALTER TABLE tasks ADD COLUMN assignees TEXT");
  }
  if (!cols.includes("start_date")) {
    db.exec("ALTER TABLE tasks ADD COLUMN start_date TEXT");
  }
  if (!cols.includes("end_date")) {
    db.exec("ALTER TABLE tasks ADD COLUMN end_date TEXT");
  }
  // 新索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_assignees ON tasks(assignees);
    CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_date, end_date);
  `);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '3')").run();
}

/**
 * Schema 迁移到 v4（幂等）：project_sets 加 sort 列，按 created_at 顺序补值
 * v4：项目集拖拽排序持久化
 */
export function migrateToV4(db) {
  const cols = db.prepare("PRAGMA table_info(project_sets)").all().map((c) => c.name);
  if (!cols.includes("sort")) {
    db.exec("ALTER TABLE project_sets ADD COLUMN sort INTEGER");
  }
  // 已有数据按 created_at 顺序补 sort（空 sort 或历史数据）
  const rows = db.prepare("SELECT id FROM project_sets WHERE sort IS NULL ORDER BY created_at, id").all();
  const upd = db.prepare("UPDATE project_sets SET sort = ? WHERE id = ?");
  const updAll = db.transaction((list) => {
    list.forEach((r, i) => upd.run(i, r.id));
  });
  updAll(rows);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '4')").run();
}

/**
 * Schema 迁移到 v5（幂等）：文件资产化 + 会话关联 + 项目总结表
 *
 * - annotations 加 kind 列（默认 'note'，老便利贴自动归类为普通笔记）
 * - files 加 size / ext / indexed / digest 列（文件资产化）
 * - projects 加 session_ids 列（会话关联，JSON 数组字符串）
 * - 新建 project_summaries 表（总结持久化）
 *
 * @param {Database} db
 */
export function migrateToV5(db) {
  const annCols = db.prepare("PRAGMA table_info(annotations)").all().map((c) => c.name);
  if (!annCols.includes("kind")) {
    db.exec("ALTER TABLE annotations ADD COLUMN kind TEXT DEFAULT 'note'");
  }

  const fileCols = db.prepare("PRAGMA table_info(files)").all().map((c) => c.name);
  if (!fileCols.includes("size")) {
    db.exec("ALTER TABLE files ADD COLUMN size INTEGER");
  }
  if (!fileCols.includes("ext")) {
    db.exec("ALTER TABLE files ADD COLUMN ext TEXT");
  }
  if (!fileCols.includes("indexed")) {
    db.exec("ALTER TABLE files ADD COLUMN indexed INTEGER DEFAULT 0");
  }
  if (!fileCols.includes("digest")) {
    db.exec("ALTER TABLE files ADD COLUMN digest TEXT");
  }

  const projCols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  if (!projCols.includes("session_ids")) {
    db.exec("ALTER TABLE projects ADD COLUMN session_ids TEXT DEFAULT '[]'");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_summaries_project ON project_summaries(project_id);
  `);

  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '5')").run();
}

/**
 * Schema 迁移到 v6（幂等）：项目归档能力
 * - projects 加 archived（0/1）与 archived_at（ISO 时间，归档时写入，取消归档清空）
 *
 * @param {Database} db
 */
export function migrateToV6(db) {
  const projCols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  if (!projCols.includes("archived")) {
    db.exec("ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  if (!projCols.includes("archived_at")) {
    db.exec("ALTER TABLE projects ADD COLUMN archived_at TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived)");
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '6')").run();
}

// 兼容旧导出名（旧版测试/脚本可能引用）
/**
 * Schema 迁移到 v7（幂等）：项目收藏能力
 * - projects 加 pinned（0/1，默认 0；1=收藏，同组内置顶展示）
 * - 索引放迁移函数（SCHEMA_SQL 不引用新列，老库执行安全）
 *
 * @param {Database} db
 */
export function migrateToV7(db) {
  const projCols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  if (!projCols.includes("pinned")) {
    db.exec("ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_pinned ON projects(pinned)");
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '7')").run();
}

// 兼容旧导出名（旧版测试/脚本可能引用）
export const migrateV1ToV2 = migrateToV3;

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