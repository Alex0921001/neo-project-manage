import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, execSync } from "node:child_process";
import { createDataAccess } from "../lib/data.js";
import { registerProjectSetsRoutes } from "./modules/project-sets.js";
import { registerProjectsRoutes } from "./modules/projects.js";
import { registerTasksRoutes } from "./modules/tasks.js";
import { registerAnnotationsRoutes } from "./modules/annotations.js";
import { registerFilesRoutes } from "./modules/files.js";
import { registerNotesRoutes } from "./modules/notes.js";

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

const DEBUG = true; // 调试模式：关闭前端缓存，改前端刷新即生效

let cachedJs = null;
let cachedCss = null;

function loadAssets() {
  const assets = fs.readdirSync(ASSETS_DIR);
  const jsFile = assets.find((f) => f.endsWith(".js"));
  const cssFile = assets.find((f) => f.endsWith(".css"));

  if (DEBUG || !cachedJs) {
    if (jsFile) cachedJs = fs.readFileSync(path.join(ASSETS_DIR, jsFile), "utf-8");
    if (cssFile) cachedCss = fs.readFileSync(path.join(ASSETS_DIR, cssFile), "utf-8");
  }
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
<script>${cachedJs || ""}</script>
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

  // ===== Domain API（按职责分模块注册） =====
  registerProjectSetsRoutes(app, data);
  registerProjectsRoutes(app, data);
  registerTasksRoutes(app, data);
  app.get("/api/__diag_after_tasks__", (c) => c.json({ ok: true }));
  registerAnnotationsRoutes(app, data);
  app.get("/api/__diag_after_anns__", (c) => c.json({ ok: true }));
  registerFilesRoutes(app, data);
  registerNotesRoutes(app, data);
  app.get("/api/__diag_all_routes__", (c) => c.json({ ok: true }));

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

  // ===== Debug =====
  app.get("/api/debug-project/:id", (c) => {
    const pid = c.req.param("id");
    const proj = data.getProject(pid);
    if (!proj) return c.json({ ok: false, error: "not found" });
    const files = (proj.files || []).map((f) => ({
      ...f,
      hasPath: typeof f.path === "string" && f.path.length > 0,
    }));
    return c.json({ ok: true, data: { id: proj.id, name: proj.name, files } });
  });

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

  app.get("/api/open-file", (c) => {
    try {
      const filePath = c.req.query("path");
      if (!filePath) return c.json({ ok: false, error: "缺少 path 参数" });
      exec(`powershell.exe -NoProfile -Command "Start-Process '${filePath.replace(/'/g, "''")}'"`);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}