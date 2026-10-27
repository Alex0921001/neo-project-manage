/**
 * 组装 neo-project-manage v2 App 到 dist/neo-project-manage-v2/
 *
 * 用法：node scripts/build-v2-app.mjs
 *   （建议用 Node 22+；前端构建会调用同版本 node 跑 vite）
 *
 * 产物结构：
 *   dist/neo-project-manage-v2/
 *     manifest.json        v2 清单（版本取自 package.json）
 *     index.js             defineApp 入口
 *     sdk/                 服务端 SDK（从 hana-app-creator 资产解出）
 *     lib/ tools/ routes/ icons/ docs/
 *     ui/index.html + ui/assets/*   前端构建产物
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "neo-project-manage-v2");
const SDK_TGZ =
  process.env.HANA_APP_SDK_TGZ ||
  path.join(os.homedir(), ".hanako", "skills", "hana-app-creator", "assets", "sdk", "hana-app-sdk.tgz");

const log = (...a) => console.log("[build-v2]", ...a);
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const cp = (src, dest) => fs.cpSync(src, dest, { recursive: true, dereference: true });

function step(msg, fn) {
  process.stdout.write(`[build-v2] ${msg} ... `);
  fn();
  process.stdout.write("ok\n");
}

// 1) 清理并建目录
step("清理 dist/", () => {
  rm(OUT);
  fs.mkdirSync(OUT, { recursive: true });
});

// 2) manifest（注入版本）
step("写入 manifest.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  const raw = fs.readFileSync(path.join(ROOT, "v2", "manifest.json"), "utf-8").replace("__VERSION__", pkg.version);
  fs.writeFileSync(path.join(OUT, "manifest.json"), raw);
});

// 3) 入口
step("写入 index.js", () => {
  cp(path.join(ROOT, "v2", "index.js"), path.join(OUT, "index.js"));
});

// 4) 运行期源码目录
// 注意：routes/ 改名为 backend/，因为 v2 约定顶层 routes/*.js 与 ctx.routes.register() 互斥
step("复制 lib/tools/backend/icons/docs", () => {
  for (const dir of ["lib", "tools", "icons", "docs"]) {
    cp(path.join(ROOT, dir), path.join(OUT, dir));
  }
  cp(path.join(ROOT, "routes"), path.join(OUT, "backend"));
  // v2 用 node:sqlite，原生 better-sqlite3 不必打包
  rm(path.join(OUT, "lib", "vendor"));
  rm(path.join(OUT, "lib", "node_modules"));
});

// 5) 图标与封面（icon 在包根 assets/；封面是卡片 face，相对 ui/ 解析，放 ui/assets/）
step("复制 assets", () => {
  cp(path.join(ROOT, "v2", "assets", "icon.png"), path.join(OUT, "assets", "icon.png"));
});

// 6) 服务端 SDK
step("解出服务端 SDK", () => {
  if (!fs.existsSync(SDK_TGZ)) throw new Error(`找不到 SDK 包：${SDK_TGZ}（可用 HANA_APP_SDK_TGZ 指定）`);
  const tmp = path.join(ROOT, "dist", ".sdk-tmp");
  rm(tmp);
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync("tar", ["-xzf", SDK_TGZ, "-C", tmp], { stdio: "inherit" });
  cp(path.join(tmp, "package", "dist"), path.join(OUT, "sdk"));
  rm(tmp);
});

// 7) 前端构建（v2 模式：相对 base，产物落 OUT/ui）
step("前端 vite build", () => {
  const viteBin = path.join(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) throw new Error(`找不到 vite：${viteBin}（先在 frontend/ 安装依赖）`);
  execFileSync(process.execPath, [viteBin, "build"], {
    cwd: path.join(ROOT, "frontend"),
    env: { ...process.env, NEO_PM_V2_BUILD: "1" },
    stdio: "inherit",
  });
});

// 8) 卡片封面与页面导航图标进 ui/assets（face.image / pageIcon 均相对 ui/ 解析）
step("放置卡片封面与导航图标", () => {
  const uiAssets = path.join(OUT, "ui", "assets");
  fs.mkdirSync(uiAssets, { recursive: true });
  cp(path.join(ROOT, "v2", "assets", "cover.png"), path.join(uiAssets, "cover.png"));
  cp(path.join(ROOT, "v2", "assets", "nav.svg"), path.join(uiAssets, "nav.svg"));
});

log("完成 →", OUT);