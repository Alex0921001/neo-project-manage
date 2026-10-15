/**
 * 数据迁移：v1 插件数据 → v2 App 数据
 *
 *   <HANA_HOME>/plugin-data/neo-project-manage/projects.sqlite
 *     →
 *   <HANA_HOME>/app-data/neo-project-manage-v2/projects.sqlite
 *
 * 用法：
 *   node scripts/migrate-v1-to-v2-data.mjs [--hana-home <dir>] [--force] [--dry-run]
 *
 * 说明：
 * - 默认 <HANA_HOME> 为 ~/.hanako
 * - 采用 SQL 级复制（ATTACH + 逐表 INSERT），v2 App 运行中也能迁移，
 *   不需要先停掉 App（App 持有数据库句柄时无法用文件覆盖）
 * - 按列名对齐而非按位置：v1 与 v2 的同名表列顺序可能不同（实测 projects /
 *   tasks / files / annotations / verification_items 均不同）
 * - 跳过 FTS5 影子表（_data/_idx/_content/_docsize/_config），
 *   写入虚表 fts_entries 时由 SQLite 自动维护
 * - 目标已存在数据时拒绝覆盖，需显式 --force
 * - 迁移前把目标库备份为 *.pre-migration.bak；迁移后 v1 数据保持原样，可随时回滚
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const HANA_HOME = valueOf("--hana-home", path.join(os.homedir(), ".hanako"));
const SRC_DB = path.join(HANA_HOME, "plugin-data", "neo-project-manage", "projects.sqlite");
const DST_DIR = path.join(HANA_HOME, "app-data", "neo-project-manage-v2");
const DST_DB = path.join(DST_DIR, "projects.sqlite");
const FORCE = has("--force");
const DRY = has("--dry-run");

const FTS_SHADOW_SUFFIXES = ["_data", "_idx", "_content", "_docsize", "_config"];
const log = (...a) => console.log("[migrate]", ...a);

function main() {
  log("HANA_HOME:", HANA_HOME);
  log("源库:", SRC_DB);
  log("目标库:", DST_DB);

  if (!fs.existsSync(SRC_DB)) throw new Error(`源数据库不存在：${SRC_DB}（无 v1 数据可迁移）`);
  if (!fs.existsSync(DST_DB)) throw new Error(`目标库不存在：${DST_DB}（请先安装并启动一次 v2 App）`);

  // 目标非空且未 --force 时拒绝，避免误覆盖
  const probe = new DatabaseSync(DST_DB, { readOnly: true });
  const dstRows = probe.prepare("SELECT COUNT(*) c FROM project_sets").get().c;
  probe.close();
  if (dstRows > 0 && !FORCE) {
    throw new Error(`目标已有 ${dstRows} 条项目集，确认覆盖请加 --force`);
  }

  if (DRY) {
    log("--dry-run：不写入，仅演练");
    return;
  }

  // 备份目标库（含 WAL 边车）
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(DST_DB + suffix)) {
      fs.copyFileSync(DST_DB + suffix, DST_DB + suffix + ".pre-migration.bak");
    }
  }
  log("已备份目标库为 *.pre-migration.bak");

  const dst = new DatabaseSync(DST_DB);
  dst.exec("PRAGMA foreign_keys=OFF");
  dst.exec(`ATTACH DATABASE '${SRC_DB.replace(/'/g, "''")}' AS src`);

  const master = dst
    .prepare("SELECT type,name,sql FROM src.sqlite_master WHERE name NOT LIKE 'sqlite_%'")
    .all();
  const ftsTables = master
    .filter((r) => r.type === "table" && /USING\s+fts5/i.test(r.sql || ""))
    .map((r) => r.name);
  const shadow = new Set();
  for (const f of ftsTables) for (const s of FTS_SHADOW_SUFFIXES) shadow.add(f + s);

  const tables = master
    .filter((r) => r.type === "table" && !shadow.has(r.name))
    .map((r) => r.name);

  let total = 0;
  dst.exec("BEGIN");
  for (const t of tables) {
    const srcCols = dst.prepare(`PRAGMA src.table_info("${t}")`).all().map((c) => c.name);
    const dstCols = dst.prepare(`PRAGMA main.table_info("${t}")`).all().map((c) => c.name);
    const cols = srcCols.filter((c) => dstCols.includes(c));
    const n = dst.prepare(`SELECT COUNT(*) c FROM src."${t}"`).get().c;
    dst.exec(`DELETE FROM main."${t}"`);
    if (n > 0 && cols.length > 0) {
      const list = cols.map((c) => `"${c}"`).join(",");
      dst.exec(`INSERT INTO main."${t}" (${list}) SELECT ${list} FROM src."${t}"`);
    }
    total += n;
    if (n > 0) log(`  ${t}: ${n} 行 / ${cols.length} 列`);
  }
  dst.exec("COMMIT");
  dst.exec("DETACH DATABASE src");
  dst.close();

  log(`迁移完成，合计 ${total} 行、${tables.length} 张表（已跳过 FTS 影子表）。`);
  log("v1 数据保持原样；回滚可删除目标库或还原 *.pre-migration.bak。");
}

try {
  main();
} catch (err) {
  console.error("[migrate] 失败:", err.message);
  process.exitCode = 1;
}
