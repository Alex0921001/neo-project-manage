/**
 * 校验打包后的 v2 App（自动定位 Hana 作者工具链）
 *
 * 用法：node scripts/validate-v2-app.mjs [--smoke]
 *
 * 工具链定位顺序：
 *   1. 环境变量 HANA_APP_TOOLS_ROOT / HANA_ROOT
 *   2. ~/.hanako/artifacts/server/<最新版本>/
 * 要求该目录含 APPS.md 与 scripts/validate-app.mjs。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "dist", "neo-project-manage-v2");

function hasTools(dir) {
  return fs.existsSync(path.join(dir, "APPS.md")) && fs.existsSync(path.join(dir, "scripts", "validate-app.mjs"));
}

function resolveToolsRoot() {
  const explicit = process.env.HANA_APP_TOOLS_ROOT?.trim() || process.env.HANA_ROOT?.trim();
  if (explicit && hasTools(explicit)) return explicit;
  if (explicit) throw new Error(`HANA_APP_TOOLS_ROOT 不完整（缺 APPS.md 或 scripts/validate-app.mjs）：${explicit}`);

  const base = path.join(os.homedir(), ".hanako", "artifacts", "server");
  if (fs.existsSync(base)) {
    const candidates = fs
      .readdirSync(base)
      .map((name) => path.join(base, name))
      .filter((p) => { try { return fs.statSync(p).isDirectory() && hasTools(p); } catch { return false; } })
      .sort()
      .reverse();
    if (candidates.length) return candidates[0];
  }
  throw new Error("找不到 Hana 作者工具链，请设置 HANA_APP_TOOLS_ROOT 指向含 APPS.md 的 Hana 目录");
}

const smoke = process.argv.includes("--smoke");
const toolsRoot = resolveToolsRoot();
const args = [path.join(toolsRoot, "scripts", "validate-app.mjs"), "--dir", APP_DIR];
if (smoke) args.push("--smoke");

console.log("[validate-v2] tools root:", toolsRoot);
console.log("[validate-v2] app dir:", APP_DIR);
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, HANA_APP_TOOLS_ROOT: toolsRoot },
});
process.exitCode = result.status ?? 1;
