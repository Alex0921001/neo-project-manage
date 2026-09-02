import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, execFile, execSync } from "node:child_process";
import { createDataAccess } from "../lib/data.js";
import { registerProjectSetsRoutes } from "./modules/project-sets.js";
import { registerProjectsRoutes } from "./modules/projects.js";
import { registerTasksRoutes } from "./modules/tasks.js";
import { registerAnnotationsRoutes } from "./modules/annotations.js";
import { registerFilesRoutes } from "./modules/files.js";
import { registerNotesRoutes } from "./modules/notes.js";
import { registerQuickTasksRoutes } from "./modules/quick-tasks.js";
import { registerUploadRoutes } from "./modules/upload.js";
import { registerCalendarRoutes } from "./modules/calendar.js";
import { registerMembersRoutes } from "./modules/members.js";
import { registerAuditRoutes } from "./modules/audit.js";
import { registerPlansRoutes } from "./modules/plans.js";
import { registerCommentsRoutes } from "./modules/comments.js";
import { registerRequirementsRoutes } from "./modules/requirements.js";
import { registerMessagesRoutes } from "./modules/messages.js";
import { registerSearchRoutes } from "./modules/search.js";

const __dirname_ui = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname_ui, "..");

// 启动时读取 manifest，缓存版本号（plugin 加载后版本不再变）
let CACHED_MANIFEST = null;
try {
  const raw = fs.readFileSync(path.join(PLUGIN_ROOT, "manifest.json"), "utf-8");
  CACHED_MANIFEST = JSON.parse(raw);
} catch (e) {
  CACHED_MANIFEST = { version: "unknown", name: "项目管理" };
}

// routes 模块首次被调用时的加载时间（reload 会更新）
let ROUTES_LOADED_AT = null;

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../frontend/dist/assets");
const ICONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../icons");

// dev 槽位（plugins-dev 目录）强制 DEBUG：前端产物每次请求重新读，改代码刷新即生效，无需重启
// 正式版（plugins 目录）保持生产模式：cachedJs 首次读后常驻内存，走 hash 不可变缓存
const IS_DEV_SLOT = path.dirname(fileURLToPath(import.meta.url)).includes("plugins-dev");
const DEBUG = IS_DEV_SLOT || process.env.NODE_ENV === "development" || String(process.env.NEO_PM_DEBUG || "").toLowerCase() === "true";

let cachedJs = null;
let cachedCss = null;
let cachedJsMtime = 0;
let cachedCssMtime = 0;

/**
 * 读取 Vite 构建产物并缓存（内联到 HTML，不依赖静态路由 — P0-2 真问题修复）
 * 显式匹配 ^index-.*\.(js|css)$：即使产物目录混入其他文件也不取错
 * 非 DEBUG 也按 mtime 失效：重新构建后刷新页面即生效，无需重启 Hana（迭代友好）
 */
function loadAssets() {
  const assets = fs.readdirSync(ASSETS_DIR);
  const jsFile = assets.find((f) => /^index-.*\.js$/.test(f));
  const cssFile = assets.find((f) => /^index-.*\.css$/.test(f));
  const jsPath = jsFile ? path.join(ASSETS_DIR, jsFile) : null;
  const cssPath = cssFile ? path.join(ASSETS_DIR, cssFile) : null;
  let jsMtime = 0;
  let cssMtime = 0;
  try {
    if (jsPath) jsMtime = fs.statSync(jsPath).mtimeMs;
    if (cssPath) cssMtime = fs.statSync(cssPath).mtimeMs;
  } catch (e) { /* 文件暂不可读则走重建 */ }
  if (!DEBUG && cachedJs && cachedCss && cachedJsMtime === jsMtime && cachedCssMtime === cssMtime) return;
  if (jsPath) { cachedJs = fs.readFileSync(jsPath, "utf-8"); cachedJsMtime = jsMtime; }
  if (cssPath) { cachedCss = fs.readFileSync(cssPath, "utf-8"); cachedCssMtime = cssMtime; }
}

function buildHtml(pluginId, hanaCss, theme) {
  loadAssets();

  const themeAttr = theme && theme !== "inherit" ? ` data-hana-theme="${escapeAttr(theme)}"` : "";
  const hanaLink = hanaCss ? `<link id="hana-theme-css" rel="stylesheet" href="${escapeAttr(hanaCss)}">` : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>项目管理</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">
${hanaLink}
<style>${cachedCss || ""}</style>

</head>
<body${themeAttr}>
<div id="app"></div>
<script>(function(){window.parent.postMessage({source:"hana-plugin",type:"ready"},"*")})();</script>
<script type="module">${cachedJs || ""}</script>
</body>
</html>`;
}

export default function registerPluginUiRoutes(app, ctx) {
  const data = createDataAccess(ctx.dataDir);
  ROUTES_LOADED_AT = new Date().toISOString();
  ctx.log.warn("[ui] data ready, registerTasksRoutes type:", typeof registerTasksRoutes);

  if (DEBUG) {
    app.use("*", async (c, next) => {
      const start = Date.now();
      await next();
      const url = new URL(c.req.url);
      // 过滤页面与静态资源，避免日志被刷屏
      if (url.pathname === "/page" || url.pathname.startsWith("/icons/")) return;
      ctx.log.info(`[api] ${c.req.method} ${url.pathname}${url.search} -> ${c.res.status} ${Date.now() - start}ms`);
    });
  }

  // ===== Page Shell =====
  app.get("/page", (c) => {
    const hanaCss = c.req.query("hana-css") || "";
    const theme = c.req.query("hana-theme") || "inherit";
    return c.html(buildHtml(ctx.pluginId, hanaCss, theme));
  });

  // ===== Static Icons =====
  app.get("/icons/:file", (c) => {
    const filePath = path.join(ICONS_DIR, c.req.param("file"));
    if (!fs.existsSync(filePath)) return c.json({ ok: false, error: "not found" }, 404);
    const ext = path.extname(filePath).slice(1);
    const mime = { png: "image/png" }[ext] || "application/octet-stream";
    return c.body(fs.readFileSync(filePath), 200, { "Content-Type": mime, "Cache-Control": "max-age=31536000" });
  });

  // ===== Static Frontend Assets（v1.1.1 兼容：JS/CSS 内联进 HTML，不注册静态路由 — P0-2 真问题）=====

  // ===== Domain API（按职责分模块注册） =====
  registerProjectSetsRoutes(app, data);
  registerProjectsRoutes(app, data);
  registerTasksRoutes(app, data);
  registerAnnotationsRoutes(app, data);
  registerFilesRoutes(app, data);
  registerNotesRoutes(app, data);
  registerQuickTasksRoutes(app, data);
  registerUploadRoutes(app, data, ctx);
  registerCalendarRoutes(app, data);
  registerMembersRoutes(app, data);
  registerAuditRoutes(app, data);
  registerPlansRoutes(app, data);
  // V2.6：统一评论（需求/方案共用）
  registerCommentsRoutes(app, data);
  registerRequirementsRoutes(app, data);
  // V2.3：消息中心（R1）+ 全文检索（R2）注册链末尾挂载
  registerMessagesRoutes(app, data);
  registerSearchRoutes(app, data);

  // V2.3 R2：首次启动后台建 FTS 全量索引（非阻塞；已完成则空跑，脏标记不触发）
  setTimeout(() => {
    try {
      const r = data.ensureFtsReady();
      if (r.rebuilt) ctx.log.info("[fts] 全量索引构建完成（后台）");
    } catch (e) {
      ctx.log.warn(`[fts] 全量索引构建失败: ${e.message}`);
    }
  }, 0);

  // ===== Version（前端角标使用）=====
  app.get("/api/version", (c) => {
    return c.json({
      ok: true,
      data: {
        version: CACHED_MANIFEST.version,
        name: CACHED_MANIFEST.name,
        source: ctx.pluginKey?.startsWith("dev:") ? "dev" : "community",
        loadedAt: ROUTES_LOADED_AT,
        pluginId: ctx.pluginId,
      },
    });
  });

  // ===== 功能速查（v2.1.0）：运行时读 docs/capabilities.md，内容更新无需重新构建 =====
  const capabilitiesFile = path.join(PLUGIN_ROOT, "docs", "capabilities.md");
  app.get("/api/capabilities", (c) => {
    try {
      const markdown = fs.readFileSync(capabilitiesFile, "utf-8");
      return c.json({ ok: true, data: { markdown, version: CACHED_MANIFEST.version } });
    } catch (e) {
      ctx.log.warn(`[capabilities] 读取失败: ${e.message}`);
      return c.json({ ok: false, error: "capabilities.md 读取失败" }, 500);
    }
  });

  // ===== Debug（仅保留 pick-file / open-file 桌面能力）=====

  // ===== Windows 文件选取 / 打开 =====
  app.get("/api/pick-file", (c) => {
    try {
      const result = execSync(
        `[Console]::OutputEncoding = [Text.Encoding]::UTF8;` +
        `$OutputEncoding = [Text.Encoding]::UTF8;` +
        `Add-Type -AssemblyName System.Windows.Forms;` +
        `$f = New-Object System.Windows.Forms.OpenFileDialog;` +
        `$f.Multiselect = $true;` +
        `$f.Filter = "所有文件 (*.*)|*.*";` +
        `$f.ShowDialog() | Out-Null;` +
        `if ($f.FileNames) { $f.FileNames | ForEach-Object { [Console]::WriteLine($_) } }`,
        { shell: "powershell.exe", encoding: "utf-8", timeout: 60000 }
      );
      const raw = result.trim();
      const paths = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (paths.length === 0) return c.json({ ok: false, error: "未选择文件" });
      return c.json({ ok: true, paths });
    } catch (e) {
      return c.json({ ok: false, error: "选择文件失败: " + e.message }, 400);
    }
  });

  app.get("/api/open-file", async (c) => {
    try {
      const filePath = c.req.query("path");
      if (!filePath) return c.json({ ok: false, error: "缺少 path 参数" });
      // 文件不存在直接报错（避免 Start-Process 静默失败，前端无感知）
      if (!fs.existsSync(filePath)) return c.json({ ok: false, error: "文件不存在或已被移动" });
      // P1-2：execFile + 参数数组（不经 cmd shell），-FilePath 字面路径 + 单引号转义
      // 注意：Windows PowerShell 5.1 的 Start-Process 没有 -LiteralPath（PS7.3+ 才有），必须用 -FilePath；
      // 路径中的 & 等字符不会被当作命令，恶意注入的单引号被 '' 转义为字面量；-ErrorAction Stop 让失败可捕获
      const psCmd = `Start-Process -FilePath '${String(filePath).replace(/'/g, "''")}' -ErrorAction Stop`;
      const result = await new Promise((resolve) => {
        execFile("powershell.exe", ["-NoProfile", "-Command", psCmd], (err, _stdout, stderr) => {
          if (err) {
            const detail = String(stderr || err.message || "").trim().split(/\r?\n/)[0];
            ctx.log.warn(`[open-file] 打开失败: ${err.message}`);
            resolve({ ok: false, error: `打开失败：${detail || err.message}` });
          } else {
            resolve({ ok: true });
          }
        });
      });
      return c.json(result);
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 打开文件所在文件夹（资源管理器定位选中该文件）：explorer /select, 路径
  app.get("/api/open-folder", (c) => {
    try {
      const filePath = c.req.query("path");
      if (!filePath) return c.json({ ok: false, error: "缺少 path 参数" });
      if (!fs.existsSync(filePath)) return c.json({ ok: false, error: "文件不存在或已被移动" });
      // windowsVerbatimArguments：参数原样传递；explorer 的 /select, 路径需自带引号，
      // 含空格路径不加引号会被 explorer 截断，回退打开默认位置（如「文档」）
      execFile("explorer.exe", [`/select,"${filePath}"`], { windowsVerbatimArguments: true }, (err) => {
        if (err) ctx.log.warn(`[open-folder] 打开失败: ${err.message}`);
      });
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}