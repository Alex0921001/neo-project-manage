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
// community 槽位部署时同步 Hana host 的 better-sqlite3@12.11.1（Hana 0.810.0 起 host ABI 147）；
// dev 槽位部署时可用本地 npm rebuild 出来的版本。
// 注意：必须用 fileURLToPath 而不是 new URL().pathname，
// 后者在 Windows 上会得到 \C:\... 形式的无效路径，导致 existsSync 恒为 false。
const __dirname_db = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.join(__dirname_db, "vendor", "better-sqlite3");
const VENDOR_ENTRY = path.join(VENDOR_DIR, "lib", "index.js");
const VENDOR_NATIVE = path.join(VENDOR_DIR, "build", "Release", "better_sqlite3.node");

// dev 探针/测试跑本机 node 时 vendor ABI 可能不匹配，设 NVM_SKIP_VENDOR=1 跳过 vendor 用 node_modules 版
const HAVE_VENDOR = fs.existsSync(VENDOR_ENTRY) && process.env.NVM_SKIP_VENDOR !== "1";

let Database;
if (HAVE_VENDOR) {
  // vendor 是 CJS，用 createRequire 加载，让内部 require('bindings') 正常工作
  const vendorRequire = createRequire(VENDOR_ENTRY);
  Database = vendorRequire(VENDOR_ENTRY);
} else {
  // 回退：依赖 Hana host 的 bare import
  Database = (await import("better-sqlite3")).default;
}

const SCHEMA_VERSION = 12;

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
  done_at TEXT,
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

-- 文件夹（V2.1.4 文件系统重构）：多层嵌套，parent_id 自引用（NULL=根）
CREATE TABLE IF NOT EXISTS file_folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES file_folders(id)
);
CREATE INDEX IF NOT EXISTS idx_file_folders_project ON file_folders(project_id);
-- 注：idx_files_folder 依赖 folder_id 新列，老库执行会报错，统一放在迁移函数中创建（新库也会走一次，幂等）。

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
  folder_id TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES file_folders(id)
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

-- 任务↔方案双向关联表（V2.2 R14，v10）：多对多，双外键级联
-- plans 表自身对 task_id 无外键，但 task_plans 引用的是 plans(id) / tasks(id) 主键，级联声明合法
CREATE TABLE IF NOT EXISTS task_plans (
  task_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  PRIMARY KEY (task_id, plan_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_taskplans_plan ON task_plans(plan_id);
`;

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "projects.sqlite");
  const db = HAVE_VENDOR ? new Database(dbPath, { nativeBinding: VENDOR_NATIVE }) : new Database(dbPath);

  // 性能与安全配置
  db.pragma("journal_mode = WAL");       // 写并发 + 崩溃恢复
  db.pragma("busy_timeout = 5000");      // 多进程共享（MCP server 与 Hana 插件并发写同一库）时等锁，避免立即 SQLITE_BUSY
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
    migrateToV9(db);
    migrateToV10(db);
    migrateToV11(db);
    migrateToV12(db);
  }
  // members 表独立于版本迁移：不 bump SCHEMA_VERSION（v7 语义不变），老库幂等补齐建表
  migrateMembersTable(db);
  // tasks.is_milestone 列同理：独立于版本迁移，老库（含已 v7 库）幂等补齐
  migrateTaskMilestone(db);
  // audit_logs 表同理：独立于版本迁移，老库幂等补齐建表 + 索引
  migrateAuditLogsTable(db);
  // projects.risk_config 列同理：独立于版本迁移，老库幂等补齐
  migrateRiskConfig(db);
  // requirements 表 + requirement_plans 关联表（V2.1.3 需求管理）：幂等建表
  migrateRequirementsTables(db);
  // file_folders 表 + files.folder_id 列（V2.1.4 文件系统重构）：幂等建表/补列
  migrateFileFoldersTable(db);
  // quick_tasks 表（临时任务）：幂等建表
  migrateQuickTasksTable(db);
  // comments 统一评论表（需求/方案共用）+ 旧 plan_comments 数据搬迁：幂等
  migrateCommentsTable(db);
  // versions 版本快照表（需求/方案共用）：幂等
  migrateVersionsTable(db);
  // verifications 验证清单表（V2.6）：幂等
  migrateVerificationsTable(db);
  // deleted_batch_keys 消息删除抑制表（V2.6.1）：幂等
  migrateDeletedBatchKeys(db);

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

/**
 * Schema 迁移到 v9（幂等）：任务完成时间
 * - tasks 加 done_at 列（本地时间 ISO 字符串；done=true 时写入，done=false 清空）
 * 老数据不回填（PM 拍板）：历史完成任务无完成时间，统计自功能上线起算。
 * R3 与后续 R14 可能共用 v9 语义，先占 v9 版本号，R14 届时用 v10。
 *
 * @param {Database} db
 */
export function migrateToV9(db) {
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!taskCols.includes("done_at")) {
    db.exec("ALTER TABLE tasks ADD COLUMN done_at TEXT");
  }
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '9')").run();
}

/**
 * Schema 迁移到 v10（幂等）：任务↔方案双向关联表 task_plans
 *
 * R14 任务和方案双向关联：多对多挂载（task_id ↔ plan_id，双外键 CASCADE）。
 * 与 plans.task_id（单对单「转任务」标记）语义独立，互不干扰。
 * 新库 SCHEMA_SQL 已直建；老库（已升 v9）幂等补齐。
 *
 * @param {Database} db
 */
export function migrateToV10(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_plans (
      task_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      PRIMARY KEY (task_id, plan_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_taskplans_plan ON task_plans(plan_id);
  `);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '10')").run();
}

/**
 * Schema 迁移到 v11（幂等）：消息中心 + 全文检索（V2.3 R1+R2，一个函数建全部新表）
 *
 * R1 消息中心：
 * - messages：统一通知入口（deadline 到期提醒 / risk 风险提醒 / synergy 协同通知预留）
 *   - batch_key UNIQUE：同类型同批次幂等去重（INSERT OR IGNORE，不重复生成）
 *   - project_id 可空（deadline 聚合消息跨项目归 NULL，risk 消息按项目归属）；外键级联
 * R2 全文检索：
 * - fts_entries：FTS5 trigram 虚拟表（entry_id/project_id/type/ref_id UNINDEXED + title/body 可检索）
 *   - 中文可用：trigram 按 3 字符切分，<3 字词走 LIKE 兕底（searchAll 内部处理）
 *   - UNINDEXED 列不可 MATCH，只作过滤/回显；FTS5 删除受限（须 MATCH/rowid），重建用 rowid 删除
 * - fts_dirty：脏标记表（project_id PK + updated_at），写操作经 logAudit 注入，搜索时按需重建
 * - fts_meta：key/value 元信息（full_indexed=1 表示全量索引已完成，首次启动后台建索引）
 *
 * @param {Database} db
 */
export function migrateToV11(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      ref_task_id TEXT,
      ref_plan_id TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      batch_key TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (batch_key),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_project_time ON messages(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_project_read ON messages(project_id, read);

    CREATE VIRTUAL TABLE IF NOT EXISTS fts_entries USING fts5(
      entry_id UNINDEXED,
      project_id UNINDEXED,
      type UNINDEXED,
      ref_id UNINDEXED,
      title,
      body,
      tokenize = 'trigram'
    );

    CREATE TABLE IF NOT EXISTS fts_dirty (
      project_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fts_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '11')").run();
}

/**
 * Schema 迁移到 v12（幂等）：设置表（V2.3 精修 #7：消息提醒配置等）
 *
 * settings：key/value 键值表，存用户可配置项（消息中心 deadline 提前天数 / 类型开关）。
 * 新库 SCHEMA_SQL 已直建；老库（已升 v11）幂等补齐。
 *
 * @param {Database} db
 */
export function migrateToV12(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '12')").run();
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
 * 补齐 projects.risk_config 列（幂等，老库/新库皆可执行）
 *
 * 项目级风险规则配置（V2.1）：JSON 字符串，覆盖 7 条风险识别规则的开关/阈值/等级。
 * 不 bump SCHEMA_VERSION：risk_config 是 projects 表新列，既有列/索引语义不变，
 * 老库（含已升到 v8 的库）通过 PRAGMA 检查幂等补齐。
 *
 * @param {Database} db
 */
export function migrateRiskConfig(db) {
  const projCols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  if (!projCols.includes("risk_config")) {
    db.exec("ALTER TABLE projects ADD COLUMN risk_config TEXT");
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
 * 补齐 requirements / requirement_plans 表（V2.1.3 需求管理，幂等）
 * requirements：项目级需求（三态：待处理/已完成/已取消）
 * requirement_plans：需求↔方案多对多双向挂载
 * 不 bump SCHEMA_VERSION：全新数据表，CREATE TABLE IF NOT EXISTS 天然幂等（与 audit_logs 策略一致）
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

/**
 * 补齐 requirements / requirement_plans 表（V2.1.3 需求管理，幂等）
 * requirements：项目级需求（三态：待处理/已完成/已取消）
 * requirement_plans：需求↔方案多对多双向挂载
 * 不 bump SCHEMA_VERSION：全新数据表，CREATE TABLE IF NOT EXISTS 天然幂等（与 audit_logs 策略一致）
 *
 * @param {Database} db
 */
export function migrateRequirementsTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT '待处理',
      priority TEXT DEFAULT 'P3',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
    CREATE TABLE IF NOT EXISTS requirement_plans (
      requirement_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      PRIMARY KEY (requirement_id, plan_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reqplans_plan ON requirement_plans(plan_id);
  `);
}

/**
 * 补齐文件夹能力（V2.1.4 文件系统重构，幂等，老库/新库皆可执行）
 *
 * - file_folders 表：多层嵌套文件夹（parent_id 自引用，NULL=根目录）
 * - files 表加 folder_id 列（NULL=根目录），外键关联 file_folders(id)
 *   （删除文件夹走「内容提升」逻辑，先提升再删，外键 NO ACTION 兜底防误删丢结构）
 *
 * 不 bump SCHEMA_VERSION：全新数据表 + 新列，与 members/audit_logs 策略一致，
 * CREATE TABLE IF NOT EXISTS + PRAGMA 检查幂等，老库（含已升到 v8 的库）自动补齐。
 *
 * @param {Database} db
 */
export function migrateFileFoldersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES file_folders(id)
    );
    CREATE INDEX IF NOT EXISTS idx_file_folders_project ON file_folders(project_id);
  `);
  const fileCols = db.prepare("PRAGMA table_info(files)").all().map((c) => c.name);
  if (!fileCols.includes("folder_id")) {
    // SQLite 允许 ADD COLUMN 带外键（默认值 NULL 时合法），老库升级不丢数据
    db.exec("ALTER TABLE files ADD COLUMN folder_id TEXT REFERENCES file_folders(id)");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_files_folder ON files(project_id, folder_id)");
}

/**
 * 临时任务表（幂等，老库/新库皆可执行）
 *
 * - 全局独立存储，不关联项目
 * - status 四态：active（未完成）/ done（已完成）/ converted（已转化）/ archived（已归档）
 * - converted_task_id / converted_project 记录转化去向（方案②转正式任务）
 *
 * 不 bump SCHEMA_VERSION：全新数据表，CREATE TABLE IF NOT EXISTS 幂等，与 members/audit_logs 策略一致。
 */
export function migrateQuickTasksTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_tasks (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      done_at TEXT,
      archived_at TEXT,
      converted_task_id TEXT,
      converted_project TEXT,
      converted_project_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quick_tasks_status ON quick_tasks(status);
  `);
  // 幂等补列（早期开发副本可能建过无 converted_project_id 的旧结构）
  const cols = db.prepare("PRAGMA table_info(quick_tasks)").all().map((c) => c.name);
  if (!cols.includes("converted_project_id")) {
    db.exec("ALTER TABLE quick_tasks ADD COLUMN converted_project_id TEXT");
  }
}

// ===== 通用工具 =====

/**
 * 统一评论表（需求/方案共用，幂等）
 *
 * - target_type('plan'|'requirement') + target_id 指向评论载体，同列多引用不做 SQL 外键，
 *   级联清理在应用层完成（deletePlan / deleteRequirement / deleteProject）
 * - quote_text / quote_anchor 为划词引用评论预留（后续方案启用）
 * - 旧 plan_comments 数据一次性搬入（按 id 判重幂等），旧表保留只读不删（防回滚）
 */
export function migrateCommentsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      edited INTEGER NOT NULL DEFAULT 0,
      quote_text TEXT,
      quote_anchor TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
  `);
  // 旧方案评论搬迁：project_id 从 plans 表补齐，按 id 判重保证幂等
  db.exec(`
    INSERT INTO comments (id, project_id, target_type, target_id, content, author, created_at, updated_at, edited)
    SELECT p.id, pl.project_id, 'plan', p.plan_id, p.content, NULL, p.created_at, NULL, 0
    FROM plan_comments p
    JOIN plans pl ON pl.id = p.plan_id
    WHERE NOT EXISTS (SELECT 1 FROM comments c WHERE c.id = p.id);
  `);
}

/**
 * 版本快照表（需求/方案共用，幂等）
 *
 * - 每次保存内容实际变化时存一版（保存后的状态），创建时存 v1
 * - version_no 按 target 递增；每 target 保留最近 50 版（应用层清理）
 * - target_type 同列多引用不做 SQL 外键；对象删除时应用层级联清理
 * - 版本内容不进 FTS 索引（只搜当前内容）
 */
export function migrateVersionsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      version_no INTEGER NOT NULL,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      extra_json TEXT,
      author TEXT,
      label TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_versions_target ON versions(target_type, target_id, version_no);
  `);
}

/**
 * 验证模块（V2.6.1 重构）：验证实体卡 + 验证项两层
 *
 * - verifications：验证实体（名称/备注/关联任务多选 JSON），列表小卡片展示
 * - verification_items：卡内验证项（分类分组 + 两态勾选落库），进度 = 项完成度
 * - 旧模型（检查项直挂需求/方案）开发期废弃：PRAGMA 检测旧结构直接重建（用户拍板弃数据）
 */
export function migrateVerificationsTable(db) {
  const cols = db.prepare("PRAGMA table_info(verifications)").all().map((col) => col.name);
  if (cols.length && !cols.includes("name")) {
    db.exec("DROP TABLE verifications");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      note TEXT DEFAULT '',
      task_ids TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_verifications_project ON verifications(project_id);
    CREATE TABLE IF NOT EXISTS verification_items (
      id TEXT PRIMARY KEY,
      verification_id TEXT NOT NULL,
      category TEXT DEFAULT '',
      content TEXT NOT NULL,
      note TEXT DEFAULT '',
      status INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT,
      checked_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (verification_id) REFERENCES verifications(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_verification_items ON verification_items(verification_id);
  `);
  // V2.6.1：验证卡补关联方案列（幂等）
  const vcols = db.prepare("PRAGMA table_info(verifications)").all().map((c) => c.name);
  if (!vcols.includes("plan_ids")) {
    db.exec("ALTER TABLE verifications ADD COLUMN plan_ids TEXT DEFAULT '[]'");
  }
  // 验证分类字典（分组管理：增删改重命名时同步 items.category）
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_categories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (project_id, name),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
  // 存量项目预置默认分类（幂等）
  const DEFAULT_CATEGORIES = ["功能验证", "边界与异常", "回归验证"];
  const insCat = db.prepare(
    "INSERT OR IGNORE INTO verification_categories (id, project_id, name, created_at) VALUES (?,?,?,?)"
  );
  const nowIso = new Date().toISOString();
  for (const p of db.prepare("SELECT id FROM projects").all()) {
    for (const name of DEFAULT_CATEGORIES) insCat.run(shortId(), p.id, name, nowIso);
  }
}

/**
 * 消息删除抑制表（幂等）
 *
 * 消息幂等靠 batch_key 在 messages 表内存在则短路；用户删除消息后 batch_key 随之消失，
 * 下次惰性扫描条件仍满足就会重新生成同一条消息（删了又来）。
 * 删除带 batch_key 的消息时在此登记抑制，扫描时命中则跳过；batch_key 含日期，
 * 抑制天然按批次过期，插入时顺手清理 30 天前的旧记录。
 */
export function migrateDeletedBatchKeys(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deleted_batch_keys (
      batch_key TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
    );
  `);
}

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