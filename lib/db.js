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

const SCHEMA_VERSION = 8;

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
  priority TEXT NOT NULL DEFAULT 'P3',
  is_milestone INTEGER NOT NULL DEFAULT 0,
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

-- 成员表（V2.0 成员管理）：全局成员名录，供人员下拉公共组件 / 历史人名补录
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

-- 审计日志表（V2.1 审计追踪）：所有写操作留痕，按 project_id 归属（可空：全局成员/项目集操作）
-- 注：idx_audit_logs_project_time 索引放迁移函数（与现有风格一致，SCHEMA_SQL 不引用）
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT '草稿',
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);

CREATE TABLE IF NOT EXISTS plan_comments (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plan_comments_plan ON plan_comments(plan_id);
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
    migrateToV8(db);
  }
  // members 表独立于版本迁移：不 bump SCHEMA_VERSION（v7 语义不变），老库幂等补齐建表
  migrateMembersTable(db);
  // tasks.is_milestone 列同理：独立于版本迁移，老库（含已 v7 库）幂等补齐
  migrateTaskMilestone(db);
  // audit_logs 表同理：独立于版本迁移，老库幂等补齐建表 + 索引
  migrateAuditLogsTable(db);

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
  // 任务优先级（P0~P5，默认 P3）：老库追加列，新库 SCHEMA_SQL 已直建；不需要索引
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!taskCols.includes("priority")) {
    db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'P3'");
  }
  // 任务里程碑（0/1，默认 0）：老库追加列，新库 SCHEMA_SQL 已直建；不需要索引
  if (!taskCols.includes("is_milestone")) {
    db.exec("ALTER TABLE tasks ADD COLUMN is_milestone INTEGER NOT NULL DEFAULT 0");
  }
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '7')").run();
}

export function migrateToV8(db) {
  // 方案管理：plans + plan_comments（v8）。新库 SCHEMA_SQL 已直建，老库幂等补齐。
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT '草稿',
      task_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plans_project ON plans(project_id);
    CREATE TABLE IF NOT EXISTS plan_comments (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plan_comments_plan ON plan_comments(plan_id);
  `);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '8')").run();
}

// 兼容旧导出名（旧版测试/脚本可能引用）
export const migrateV1ToV2 = migrateToV3;

/**
 * 补齐 tasks.is_milestone 列（幂等，老库/新库皆可执行）
 *
 * 任务里程碑（V2.1）：标记任务为里程碑节点，驱动任务页里程碑步骤图。
 * 不 bump SCHEMA_VERSION：is_milestone 是 tasks 表新列，v7 的列/索引语义不变，
 * 老库（含已升到 v7 的库）通过 PRAGMA 检查幂等补齐，无需版本号迁移。
 *
 * @param {Database} db
 */
export function migrateTaskMilestone(db) {
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!taskCols.includes("is_milestone")) {
    db.exec("ALTER TABLE tasks ADD COLUMN is_milestone INTEGER NOT NULL DEFAULT 0");
  }
}

/**
 * 补齐 members 表（幂等，老库/新库皆可执行）
 *
 * V2.0 成员管理：全局成员名录独立成表。
 * 不 bump SCHEMA_VERSION：members 表是数据表层面的新能力，v7 的列/索引语义不变，
 * 老库通过 CREATE TABLE IF NOT EXISTS 天然幂等补齐，无需走版本号迁移。
 *
 * @param {Database} db
 */
export function migrateMembersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * 补齐 audit_logs 表 + 索引（幂等，老库/新库皆可执行）
 *
 * V2.1 审计追踪：所有写操作留痕（创建/编辑/删除/归档/状态/成员变更等），
 * 按 project_id 归属（可空：全局成员/项目集操作无项目归属，归 NULL）。
 * 不 bump SCHEMA_VERSION：audit_logs 是全新数据表，CREATE TABLE IF NOT EXISTS 天然幂等，
 * 老库（含已升到 v7 的库）执行一次即补齐，无需走版本号迁移（与 members 表策略一致）。
 *
 * @param {Database} db
 */
export function migrateAuditLogsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_project_time ON audit_logs(project_id, created_at);
  `);
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