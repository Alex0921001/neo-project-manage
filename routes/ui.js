import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataAccess } from "../lib/data.js";
import { exec, execSync } from "node:child_process";

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../frontend/dist/assets");

const ICONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../icons");

const DEBUG = true; // 调试模式：关闭前端缓存，改前端刷新即生效

let cachedJs = null;
let cachedCss = null;

function loadAssets() {
  const readOpt = DEBUG ? {} : undefined; // debug 模式每次重新读取
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
  const PROJS_PATH = path.join(ctx.dataDir, "projects.json");

  // 内联子任务读写函数，绕过 data.js 的 ESM 缓存问题
  function readProjects() {
    try { const raw = fs.readFileSync(PROJS_PATH, "utf-8").trim(); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  function writeProjects(items) { fs.mkdirSync(path.dirname(PROJS_PATH), { recursive: true }); fs.writeFileSync(PROJS_PATH, JSON.stringify(items, null, 2), "utf-8"); }

// ===== Page Shell =====
  app.get("/page", (c) => {
    const hanaCss = c.req.query("hana-css") || "";
    const theme = c.req.query("hana-theme") || "inherit";
    return c.html(buildHtml(ctx.pluginId, hanaCss, theme));
  });

  // ===== Static Font Files =====
  app.get("/icons/:file", (c) => {
    const filePath = path.join(ICONS_DIR, c.req.param("file"));
    if (!fs.existsSync(filePath)) return c.json({ ok: false, error: "not found" }, 404);
    const ext = path.extname(filePath).slice(1);
    const mime = { png: "image/png" }[ext] || "application/octet-stream";
    return c.body(fs.readFileSync(filePath), 200, { "Content-Type": mime, "Cache-Control": "max-age=31536000" });
  });

  // ===== Project Sets =====
  app.get("/api/project-sets", (c) => {
    const sets = data.listProjectSetsWithCounts();
    return c.json({ ok: true, data: sets });
  });

  app.post("/api/project-sets", async (c) => {
    const body = await c.req.json();
    const set = data.createProjectSet(body);
    return c.json({ ok: true, data: set });
  });

  app.put("/api/project-sets/:id", async (c) => {
    const body = await c.req.json();
    const set = data.updateProjectSet(c.req.param("id"), body);
    if (!set) return c.json({ ok: false, error: "项目集不存在" }, 404);
    return c.json({ ok: true, data: set });
  });

  app.delete("/api/project-sets/:id", (c) => {
    try {
      data.deleteProjectSet(c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== Projects =====
  app.get("/api/projects", (c) => {
    const projectSetId = c.req.query("projectSetId");
    const projects = data.listProjects(projectSetId !== undefined ? projectSetId : undefined);
    return c.json({ ok: true, data: projects });
  });

  app.get("/api/projects/:id", (c) => {
    const project = data.getProject(c.req.param("id"));
    if (!project) return c.json({ ok: false, error: "项目不存在" }, 404);
    return c.json({ ok: true, data: project });
  });

  app.post("/api/projects", async (c) => {
    const body = await c.req.json();
    const project = data.createProject(body);
    return c.json({ ok: true, data: project });
  });

  app.put("/api/projects/:id", async (c) => {
    const body = await c.req.json();
    const project = data.updateProject(c.req.param("id"), body);
    if (!project) return c.json({ ok: false, error: "项目不存在" }, 404);
    return c.json({ ok: true, data: project });
  });

  app.delete("/api/projects/:id", (c) => {
    data.deleteProject(c.req.param("id"));
    return c.json({ ok: true });
  });

  // ===== Tasks =====
  app.post("/api/projects/:projectId/tasks", async (c) => {
    const body = await c.req.json();
    try {
      const task = data.createTask(c.req.param("projectId"), body);
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId", async (c) => {
    const body = await c.req.json();
    try {
      const task = data.updateTask(c.req.param("projectId"), c.req.param("taskId"), body);
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId", (c) => {
    try {
      data.deleteTask(c.req.param("projectId"), c.req.param("taskId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== Sub Tasks =====
  app.post("/api/projects/:projectId/tasks/:taskId/subtasks", async (c) => {
    const body = await c.req.json();
    try {
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const all = readProjects();
      const proj = all.find(p => p.id === projId);
      if (!proj) throw new Error(`项目 ${projId} 不存在`);
      const task = proj.tasks?.find(t => t.id === taskId);
      if (!task) throw new Error(`任务 ${taskId} 不存在`);
      if (!task.subtasks) task.subtasks = [];
      const sub = { id: crypto.randomUUID().slice(0, 8), name: body.name, description: body.description || "", done: false };
      task.subtasks.push(sub);
      writeProjects(all);
      return c.json({ ok: true, data: sub });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId", async (c) => {
    const body = await c.req.json();
    try {
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const subId = c.req.param("subtaskId");
      const all = readProjects();
      const proj = all.find(p => p.id === projId);
      if (!proj) throw new Error(`项目 ${projId} 不存在`);
      const task = proj.tasks?.find(t => t.id === taskId);
      if (!task) throw new Error(`任务 ${taskId} 不存在`);
      if (!task.subtasks) task.subtasks = [];
      const sub = task.subtasks.find(s => s.id === subId);
      if (!sub) throw new Error(`子任务 ${subId} 不存在`);
      if (body.name !== undefined) sub.name = body.name;
      if (body.description !== undefined) sub.description = body.description;
      if (body.done !== undefined) sub.done = body.done;
      writeProjects(all);
      return c.json({ ok: true, data: sub });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId", (c) => {
    try {
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const subId = c.req.param("subtaskId");
      const all = readProjects();
      const proj = all.find(p => p.id === projId);
      if (!proj) throw new Error(`项目 ${projId} 不存在`);
      const task = proj.tasks?.find(t => t.id === taskId);
      if (!task) throw new Error(`任务 ${taskId} 不存在`);
      if (!task.subtasks) task.subtasks = [];
      const idx = task.subtasks.findIndex(s => s.id === subId);
      if (idx === -1) throw new Error(`子任务 ${subId} 不存在`);
      task.subtasks.splice(idx, 1);
      writeProjects(all);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== Files =====
  app.post("/api/projects/:projectId/files", async (c) => {
    const body = await c.req.json();
    const projectId = c.req.param("projectId");
    const filePath = body.path;
    if (!filePath || typeof filePath !== "string") {
      return c.json({ ok: false, error: "缺少文件路径" }, 400);
    }
    try {
      // Read JSON directly to bypass module cache issues
      const projsFile = path.join(ctx.dataDir, "projects.json");
      const raw = fs.readFileSync(projsFile, "utf-8").trim();
      const all = JSON.parse(raw);
      const proj = all.find((p) => p.id === projectId);
      if (!proj) return c.json({ ok: false, error: "项目不存在" }, 400);
      if (!proj.files) proj.files = [];
      const name = filePath.split(/[\\/]/).pop() || filePath;
      const file = {
        id: Math.random().toString(36).slice(2, 10),
        name,
        path: filePath,
        uploadedAt: new Date().toISOString().slice(0, 10),
      };
      proj.files.push(file);
      fs.writeFileSync(projsFile, JSON.stringify(all, null, 2), "utf-8");
      return c.json({ ok: true, data: file });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/files/:fileId", (c) => {
    try {
      const projsFile = path.join(ctx.dataDir, "projects.json");
      const raw = fs.readFileSync(projsFile, "utf-8").trim();
      const all = JSON.parse(raw);
      const proj = all.find((p) => p.id === c.req.param("projectId"));
      if (!proj) return c.json({ ok: false, error: "项目不存在" }, 400);
      if (proj.files) {
        proj.files = proj.files.filter((f) => f.id !== c.req.param("fileId"));
        fs.writeFileSync(projsFile, JSON.stringify(all, null, 2), "utf-8");
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== Notes =====
  app.post("/api/projects/:projectId/notes", async (c) => {
    const body = await c.req.json();
    const projectId = c.req.param("projectId");
    if (!body.content || !body.content.trim()) {
      return c.json({ ok: false, error: "备注内容不能为空" }, 400);
    }
    try {
      const projsFile = path.join(ctx.dataDir, "projects.json");
      const raw = fs.readFileSync(projsFile, "utf-8").trim();
      const all = JSON.parse(raw);
      const proj = all.find((p) => p.id === projectId);
      if (!proj) return c.json({ ok: false, error: "项目不存在" }, 400);
      if (!proj.notes) proj.notes = [];
      const note = { id: crypto.randomUUID().slice(0, 8), content: body.content.trim(), createdAt: new Date().toISOString().slice(0, 10) };
      proj.notes.push(note);
      fs.writeFileSync(projsFile, JSON.stringify(all, null, 2), "utf-8");
      return c.json({ ok: true, data: note });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/notes/:noteId", async (c) => {
    const body = await c.req.json();
    const projectId = c.req.param("projectId");
    const noteId = c.req.param("noteId");
    if (!body.content || !body.content.trim()) {
      return c.json({ ok: false, error: "备注内容不能为空" }, 400);
    }
    try {
      const projsFile = path.join(ctx.dataDir, "projects.json");
      const raw = fs.readFileSync(projsFile, "utf-8").trim();
      const all = JSON.parse(raw);
      const proj = all.find((p) => p.id === projectId);
      if (!proj) return c.json({ ok: false, error: "项目不存在" }, 400);
      const note = (proj.notes || []).find((n) => n.id === noteId);
      if (!note) return c.json({ ok: false, error: "备注不存在" }, 400);
      note.content = body.content.trim();
      fs.writeFileSync(projsFile, JSON.stringify(all, null, 2), "utf-8");
      return c.json({ ok: true, data: note });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/notes/:noteId", (c) => {
    const projectId = c.req.param("projectId");
    const noteId = c.req.param("noteId");
    try {
      const projsFile = path.join(ctx.dataDir, "projects.json");
      const raw = fs.readFileSync(projsFile, "utf-8").trim();
      const all = JSON.parse(raw);
      const proj = all.find((p) => p.id === projectId);
      if (!proj) return c.json({ ok: false, error: "项目不存在" }, 400);
      if (proj.notes) {
        proj.notes = proj.notes.filter((n) => n.id !== noteId);
        fs.writeFileSync(projsFile, JSON.stringify(all, null, 2), "utf-8");
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/debug-project/:id", (c) => {
    const pid = c.req.param("id");
    const proj = data.getProject(pid);
    if (!proj) return c.json({ ok: false, error: "not found" });
    const files = (proj.files || []).map(f => ({
      ...f,
      hasPath: typeof f.path === "string" && f.path.length > 0
    }));
    return c.json({ ok: true, data: { id: proj.id, name: proj.name, files } });
  });

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
      const paths = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
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
