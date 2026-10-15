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
 * - 目标已存在 projects.sqlite 时拒绝覆盖，需显式 --force
 * - 一并复制 WAL 边车文件（-wal / -shm），保证未 checkpoint 的写入不丢
 * - 迁移后 v1 插件数据保持原样，可随时回滚
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const HANA_HOME = valueOf("--hana-home", path.join(os.homedir(), ".hanako"));
const SRC_DIR = path.join(HANA_HOME, "plugin-data", "neo-project-manage");
const DST_DIR = path.join(HANA_HOME, "app-data", "neo-project-manage-v2");
const FORCE = has("--force");
const DRY = has("--dry-run");

const log = (...a) => console.log("[migrate]", ...a);

function main() {
  log("HANA_HOME:", HANA_HOME);
  log("源目录:", SRC_DIR);
  log("目标目录:", DST_DIR);

  const srcDb = path.join(SRC_DIR, "projects.sqlite");
  if (!fs.existsSync(srcDb)) {
    throw new Error(`源数据库不存在：${srcDb}（无 v1 数据可迁移）`);
  }

  const dstDb = path.join(DST_DIR, "projects.sqlite");
  if (fs.existsSync(dstDb) && !FORCE) {
    throw new Error(`目标已存在：${dstDb}（确认要覆盖请加 --force）`);
  }

  const srcSize = fs.statSync(srcDb).size;
  log(`源库大小: ${(srcSize / 1024 / 1024).toFixed(2)} MB`);

  if (DRY) {
    log("--dry-run：不写入，仅演练");
    return;
  }

  fs.mkdirSync(DST_DIR, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const s = srcDb + suffix;
    if (!fs.existsSync(s)) continue;
    fs.copyFileSync(s, dstDb + suffix);
    log("已复制:", path.basename(s));
  }

  log("迁移完成。v1 数据保持原样；如遇问题，删除目标目录即可回滚。");
}

try {
  main();
} catch (err) {
  console.error("[migrate] 失败:", err.message);
  process.exitCode = 1;
}
