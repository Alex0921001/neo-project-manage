/**
 * devmock.js — Vite dev server 的本地数据源（仅开发环境用，不参与构建）
 *
 * 三种模式（自动降级）：
 * 1. realDb 可读（默认）：GET 查询真实 SQLite（node:sqlite 只读），写操作走内存 overlay（会话内有效，不污染真实库）
 * 2. realDb 打不开：回退纯 mock 内存数据（见下方 initial data）
 * 3. 页面运行在 Hana 宿主 iframe 内：本文件不生效（vite.config.js 中间件只拦 /api/plugins/*）
 *
 * 真实库路径：C:\Users\1098973295\.hanako\plugin-data\dev\neo-project-manage\projects.sqlite
 * 数据结构对齐 lib/data.js（camelCase：members/assignees 解析、任务树、批注/fileRefs 挂载）
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ================= 真实库（只读） =================

const DATA_DIRS = [
  process.env.NEO_PM_DATA_DIR,
  path.join(os.homedir(), ".hanako", "plugin-data", "dev", "neo-project-manage"),
  path.join(os.homedir(), ".hanako", "plugin-data", "neo-project-manage"),
].filter(Boolean);

let realDb = null;
let realDbPath = "";
for (const dir of DATA_DIRS) {
  const p = path.join(dir, "projects.sqlite");
  if (fs.existsSync(p)) {
    try {
      realDb = new DatabaseSync(p, { readOnly: true });
      realDbPath = p;
      console.log("[devmock] 已连接真实库(只读):", p);
      break;
    } catch (e) {
      console.warn("[devmock] 打开真实库失败:", p, e.message);
    }
  }
}

// ================= overlay（写操作的内存层，会话内有效） =================

const ovProjects = new Map(); // id -> 新增/覆盖的项目
const ovSets = new Map();
const ovTasks = new Map();
const ovFiles = new Map();
const ovNotes = new Map();
const ovAnns = new Map(); // taskId -> [{...}]
const delProjects = new Set();
const delSets = new Set();
const delTasks = new Set();
const delFiles = new Set();
const delNotes = new Set();

let seq = 9000;
const now = new Date().toISOString().slice(0, 10);
function uid(prefix) {
  seq += 1;
  return `${prefix}-v${seq}`;
}

// ================= 通用工具 =================

function parseArr(s) {
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s || "[]"); } catch { return []; }
}

// ================= 真实库查询 =================

function qAll(sql, params = []) {
  if (!realDb) return null;
  try { return realDb.prepare(sql).all(...params); } catch (e) { console.warn("[devmock] 查询失败:", sql, e.message); return null; }
}
function qGet(sql, params = []) {
  if (!realDb) return null;
  try { return realDb.prepare(sql).get(...params); } catch (e) { console.warn("[devmock] 查询失败:", sql, e.message); return null; }
}

function taskStats(projectId) {
  const total = qGet("SELECT COUNT(*) c FROM tasks WHERE project_id = ?", [projectId]);
  const undone = qGet("SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND done = 0", [projectId]);
  const files = qGet("SELECT COUNT(*) c FROM files WHERE project_id = ?", [projectId]);
  const notes = qGet("SELECT COUNT(*) c FROM notes WHERE project_id = ?", [projectId]);
  const ovT = [...ovTasks.values()].filter((t) => t.project_id === projectId);
  const ovF = [...ovFiles.values()].filter((f) => f.project_id === projectId);
  const ovN = [...ovNotes.values()].filter((n) => n.project_id === projectId);
  const delT = [...delTasks].filter((id) => ovTasks.has(id));
  return {
    taskCount: (total?.c || 0) + ovT.length - delT.length,
    incompleteTaskCount: (undone?.c || 0) + ovT.filter((t) => !t.done).length - delT.length,
    fileCount: (files?.c || 0) + ovF.length - [...delFiles].filter((id) => ovFiles.has(id)).length,
    noteCount: (notes?.c || 0) + ovN.length - [...delNotes].filter((id) => ovNotes.has(id)).length,
  };
}

function toProjectItem(row) {
  const stats = taskStats(row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    members: parseArr(row.members),
    planStart: row.plan_start || "",
    planEnd: row.plan_end || "",
    status: row.status,
    projectSetId: row.project_set_id || "",
    createdAt: row.created_at,
    ...stats,
  };
}

function realProjectList() {
  const rows = qAll("SELECT * FROM projects ORDER BY created_at") || [];
  const list = rows
    .filter((r) => !delProjects.has(r.id))
    .map((r) => (ovProjects.has(r.id) ? { ...toProjectItem(r), ...ovProjects.get(r.id) } : toProjectItem(r)));
  for (const p of ovProjects.values()) {
    if (delProjects.has(p.id)) continue;
    if (!rows.some((r) => r.id === p.id) && !list.some((x) => x.id === p.id)) list.push(p);
  }
  return list;
}

function realSetList() {
  const rows = qAll("SELECT * FROM project_sets ORDER BY name") || [];
  const sets = rows.filter((r) => !delSets.has(r.id)).map((r) => ({
    id: r.id, name: r.name, createdAt: r.created_at,
  }));
  for (const s of ovSets.values()) {
    if (delSets.has(s.id)) continue;
    if (!sets.some((x) => x.id === s.id)) sets.push(s);
  }
  return sets.map((s) => ({ ...s, projectCount: realProjectList().filter((p) => p.projectSetId === s.id).length }));
}

function realTaskTree(projectId) {
  const rows = qAll("SELECT * FROM tasks WHERE project_id = ? ORDER BY index_num", [projectId]) || [];
  const byId = new Map();
  for (const t of rows) {
    if (delTasks.has(t.id)) continue;
    byId.set(t.id, {
      id: t.id,
      project_id: t.project_id,
      index_num: t.index_num,
      name: t.name,
      description: t.description || "",
      done: !!t.done,
      assignees: parseArr(t.assignees),
      startDate: t.start_date || "",
      endDate: t.end_date || "",
      fileRefs: qAll("SELECT f.id, f.name FROM task_file_refs tfr JOIN files f ON f.id = tfr.file_id WHERE tfr.task_id = ?", [t.id])?.map((f) => f.id) || [],
      annotations: realAnnotations(t.id),
      subtasks: [],
    });
  }
  // overlay 任务（新增的）
  for (const t of ovTasks.values()) {
    if (t.project_id === projectId && !byId.has(t.id)) byId.set(t.id, { ...t, subtasks: [] });
  }
  // 父子挂载
  const roots = [];
  for (const node of byId.values()) {
    if (node._parentId && byId.has(node._parentId)) {
      byId.get(node._parentId).subtasks.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortChildren = (arr) => {
    arr.sort((a, b) => (a.index_num ?? 0) - (b.index_num ?? 0));
    for (const n of arr) if (n.subtasks?.length) sortChildren(n.subtasks);
  };
  sortChildren(roots);
  return roots;
}

function realAnnotations(taskId) {
  const rows = qAll("SELECT * FROM annotations WHERE task_id = ? ORDER BY created_at", [taskId]) || [];
  const base = rows.map((a) => ({
    id: a.id, content: a.content, confirmed: !!a.confirmed, confirmedAt: a.confirmed_at || "", createdAt: a.created_at,
  }));
  const ov = ovAnns.get(taskId) || [];
  return [...base, ...ov];
}

function realFullProject(id) {
  const row = qGet("SELECT * FROM projects WHERE id = ?", [id]);
  if (!row) return null;
  const base = toProjectItem(row);
  const ov = ovProjects.get(id);
  const project = { ...base, ...(ov || {}) };
  project.tasks = realTaskTree(id);
  project.files = [...(qAll("SELECT * FROM files WHERE project_id = ? ORDER BY uploaded_at DESC", [id]) || [])
    .filter((f) => !delFiles.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, path: f.path, uploadedAt: f.uploaded_at })),
    ...[...ovFiles.values()].filter((f) => f.project_id === id),
  ];
  project.notes = [...(qAll("SELECT * FROM notes WHERE project_id = ? ORDER BY created_at DESC", [id]) || [])
    .filter((n) => !delNotes.has(n.id))
    .map((n) => ({ id: n.id, content: n.content, createdAt: n.created_at })),
    ...[...ovNotes.values()].filter((n) => n.project_id === id),
  ];
  return project;
}

// ================= 纯 mock 初始数据（realDb 打不开时 fallback） =================

const mockSets = [
  { id: "set-eln", name: "ELN", createdAt: "2026-07-01" },
  { id: "set-test", name: "测试项目集", createdAt: "2026-08-01" },
];
const mockProjects = [
  { id: "p-eln", name: "ELN 权限系统开发", description: "为 ELN 实验记录本增加 RBAC 权限体系。", members: ["丁鹏", "小李", "阿凯"], planStart: "2026-07-28", planEnd: "2026-08-30", status: "进行中", projectSetId: "set-eln", createdAt: "2026-07-28" },
  { id: "p-upgrade", name: "1.4 升级开发", description: "升级 + 权限系统开发。", members: ["丁鹏"], planStart: "2026-07-28", planEnd: "2026-08-02", status: "已完成", projectSetId: "set-eln", createdAt: "2026-07-28" },
  { id: "p-test", name: "测试项目0809", description: "临时测试项目。", members: ["丁鹏"], planStart: "2026-08-16", planEnd: "2026-08-30", status: "待开始", projectSetId: "set-test", createdAt: "2026-08-09" },
  { id: "p-ab", name: "抗体序列分析工具", description: "抗体序列比对与引物设计辅助工具。", members: ["丁鹏", "小陈"], planStart: "2026-06-01", planEnd: "2026-09-15", status: "进行中", projectSetId: "", createdAt: "2026-06-01" },
];
const mockTasks = [
  { id: "t1", project_id: "p-eln", index_num: 0, name: "设计权限模型", description: "梳理角色与权限矩阵", done: true, assignees: ["丁鹏"], startDate: "2026-07-28", endDate: "2026-08-01", fileRefs: [], annotations: [{ id: "a1", content: "权限粒度需要细化到字段级", confirmed: true, createdAt: "2026-08-03" }], subtasks: [
    { id: "t1a", project_id: "p-eln", index_num: 0, name: "角色清单", description: "", done: true, assignees: [], startDate: "", endDate: "", fileRefs: [], annotations: [], subtasks: [] },
    { id: "t1b", project_id: "p-eln", index_num: 1, name: "字段级授权方案评审", description: "与数据组对齐字段粒度", done: false, assignees: ["小李"], startDate: "2026-08-02", endDate: "2026-08-05", fileRefs: ["f1"], annotations: [], subtasks: [] },
  ] },
  { id: "t2", project_id: "p-eln", index_num: 1, name: "实现 RBAC 中间件", description: "基于 Hono 的权限中间件", done: false, assignees: ["阿凯"], startDate: "2026-08-03", endDate: "2026-08-14", fileRefs: [], annotations: [{ id: "a2", content: "给测试同学留验收清单", confirmed: false, createdAt: "2026-08-06" }], subtasks: [] },
  { id: "t3", project_id: "p-eln", index_num: 2, name: "前端权限控制", description: "按钮级权限指令", done: false, assignees: ["小李"], startDate: "2026-08-10", endDate: "2026-08-20", fileRefs: [], annotations: [], subtasks: [] },
  { id: "t4", project_id: "p-upgrade", index_num: 0, name: "完成 1.4 全部功能", description: "", done: true, assignees: ["丁鹏"], startDate: "2026-07-28", endDate: "2026-08-02", fileRefs: [], annotations: [], subtasks: [] },
  { id: "t5", project_id: "p-ab", index_num: 0, name: "序列比对算法选型", description: "BLAST vs 自研 k-mer", done: true, assignees: ["小陈"], startDate: "2026-06-01", endDate: "2026-06-15", fileRefs: [], annotations: [], subtasks: [] },
  { id: "t6", project_id: "p-ab", index_num: 1, name: "引物设计模块", description: "TM 值计算", done: false, assignees: ["小陈"], startDate: "2026-07-01", endDate: "2026-08-31", fileRefs: [], annotations: [], subtasks: [] },
];
const mockFiles = [
  { id: "f1", project_id: "p-eln", name: "权限模型设计.docx", path: "C:/mock/权限模型设计.docx", uploadedAt: "2026-08-02" },
];
const mockNotes = [
  { id: "n1", project_id: "p-eln", content: "7/28 会议纪要：权限模型定稿。", createdAt: "2026-07-28" },
];

// ================= 纯 mock 查询（fallback） =================

function mockStats(projectId) {
  const all = [];
  const walk = (arr) => arr.forEach((t) => { all.push(t); if (t.subtasks?.length) walk(t.subtasks); });
  walk(mockTasks.filter((t) => t.project_id === projectId));
  return {
    taskCount: all.length,
    incompleteTaskCount: all.filter((t) => !t.done).length,
    fileCount: mockFiles.filter((f) => f.project_id === projectId).length,
    noteCount: mockNotes.filter((n) => n.project_id === projectId).length,
  };
}
function mockProjectList() {
  return mockProjects.map((p) => ({ ...p, ...mockStats(p.id) }));
}
function mockFullProject(id) {
  const p = mockProjects.find((x) => x.id === id);
  if (!p) return null;
  const walk = (arr) => arr.map((t) => ({ ...t, subtasks: t.subtasks ? walk(t.subtasks) : [] }));
  return { ...p, ...mockStats(id), tasks: walk(mockTasks.filter((t) => t.project_id === id && !t._parent)), files: mockFiles.filter((f) => f.project_id === id), notes: mockNotes.filter((n) => n.project_id === id) };
}

// ================= 请求分发 =================

function respond(data) {
  return { ok: true, data };
}
function err(msg) {
  return { ok: false, error: msg };
}

export async function mockApi(method, path, query, body) {
  const p = path.replace(/^\/+/, "");
  const segs = p.split("/").filter(Boolean);
  const q = query || {};

  if (p === "api/version") {
    return respond({ version: "1.2.0", source: realDb ? "real-sqlite(ro)" : "mock", loadedAt: now + "T00:00:00", frontendBuiltAt: "dev" });
  }
  if (p === "api/pick-file") return respond({ ok: true, path: "C:/mock/示例文件.docx", name: "示例文件.docx" });
  if (p.startsWith("api/open-file")) return respond({ ok: true });

  // ---- 项目集 ----
  if (p === "api/project-sets" && method === "GET") {
    if (realDb) return respond(realSetList());
    return respond(mockSets.map((s) => ({ ...s, projectCount: mockProjectList().filter((x) => x.projectSetId === s.id).length })));
  }
  if (p === "api/project-sets" && method === "POST") {
    if (!body?.name?.trim()) return err("项目集名称不能为空");
    const s = { id: realDb ? uid("set") : "set-" + uid("m"), name: body.name.trim(), createdAt: now };
    if (realDb) ovSets.set(s.id, s);
    else mockSets.push(s);
    return respond(s);
  }
  const setMatch = p.match(/^api\/project-sets\/([^/]+)$/);
  if (setMatch && method === "PUT") {
    if (realDb) {
      const s = realSetList().find((x) => x.id === setMatch[1]);
      if (!s) return err("项目集不存在");
      ovSets.set(s.id, { ...s, name: body?.name ?? s.name });
      return respond(ovSets.get(s.id));
    }
    const s = mockSets.find((x) => x.id === setMatch[1]);
    if (!s) return err("项目集不存在");
    if (body?.name) s.name = body.name;
    return respond(s);
  }
  if (setMatch && method === "DELETE") {
    if (realDb) {
      if (realProjectList().some((x) => x.projectSetId === setMatch[1])) return err("项目集下还有项目，无法删除");
      delSets.add(setMatch[1]);
      return respond({ ok: true });
    }
    const i = mockSets.findIndex((x) => x.id === setMatch[1]);
    if (i < 0) return err("项目集不存在");
    if (mockProjects.some((x) => x.projectSetId === setMatch[1])) return err("项目集下还有项目，无法删除");
    mockSets.splice(i, 1);
    return respond({ ok: true });
  }

  // ---- 项目 ----
  if (p === "api/projects" && method === "GET") {
    let list = realDb ? realProjectList() : mockProjectList();
    if (q.projectSetId && q.projectSetId !== "null" && q.projectSetId !== "") list = list.filter((x) => x.projectSetId === q.projectSetId);
    if (q.q) list = list.filter((x) => x.name.includes(q.q) || (x.description || "").includes(q.q));
    if (q.status) list = list.filter((x) => x.status === q.status);
    return respond(list);
  }
  if (p === "api/projects" && method === "POST") {
    const proj = {
      id: realDb ? uid("p") : "p-" + uid("m"),
      name: body?.name || "未命名项目",
      description: body?.description || "",
      members: body?.members || [],
      planStart: body?.planStart || "",
      planEnd: body?.planEnd || "",
      status: body?.status || "待开始",
      projectSetId: body?.projectSetId || "",
      createdAt: now,
    };
    if (realDb) ovProjects.set(proj.id, proj);
    else mockProjects.push(proj);
    const stats = realDb ? taskStats(proj.id) : mockStats(proj.id);
    return respond({ ...proj, ...stats });
  }
  const projMatch = p.match(/^api\/projects\/([^/]+)$/);
  if (projMatch) {
    const id = projMatch[1];
    if (method === "GET") {
      const full = realDb ? realFullProject(id) : mockFullProject(id);
      return full ? respond(full) : err("项目不存在");
    }
    if (method === "PUT") {
      if (realDb) {
        const base = realFullProject(id);
        if (!base) return err("项目不存在");
        ovProjects.set(id, { ...base, ...(body || {}) });
        return respond(ovProjects.get(id));
      }
      const proj = mockProjects.find((x) => x.id === id);
      if (!proj) return err("项目不存在");
      Object.assign(proj, body || {});
      return respond({ ...proj, ...mockStats(id) });
    }
    if (method === "DELETE") {
      if (realDb) delProjects.add(id);
      else {
        const i = mockProjects.findIndex((x) => x.id === id);
        if (i < 0) return err("项目不存在");
        mockProjects.splice(i, 1);
      }
      return respond({ ok: true });
    }
  }

  // ---- 任务 ----
  const taskMatch = p.match(/^api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (taskMatch) {
    const pid = taskMatch[1];
    const tid = taskMatch[2];
    const action = taskMatch[3];
    if (!tid && method === "GET") {
      return respond(realDb ? realTaskTree(pid) : mockFullProject(pid)?.tasks || []);
    }
    if (!tid && method === "POST") {
      const t = {
        id: realDb ? uid("t") : "t-" + uid("m"),
        project_id: pid,
        index_num: (realDb ? realTaskTree(pid) : mockFullProject(pid)?.tasks || []).length,
        name: body?.name || "新任务",
        description: body?.description || "",
        done: false,
        assignees: body?.assignees || [],
        startDate: body?.startDate || "",
        endDate: body?.endDate || "",
        fileRefs: [],
        annotations: [],
        subtasks: [],
      };
      if (body?.parentTaskId) t._parentId = body.parentTaskId;
      if (realDb) ovTasks.set(t.id, t);
      else mockTasks.push(t);
      return respond(t);
    }
    if (tid && action === "reorder-tasks" && method === "POST") return respond({ ok: true });
    if (tid && action === "move" && method === "POST") return respond({ ok: true });
    if (tid) {
      if (method === "PUT") {
        const t = realDb ? [...ovTasks.values()].find((x) => x.id === tid) : mockTasks.find((x) => x.id === tid);
        if (t) Object.assign(t, body || {});
        return respond(t || { ok: true });
      }
      if (method === "DELETE") {
        if (realDb) delTasks.add(tid);
        else {
          const i = mockTasks.findIndex((x) => x.id === tid);
          if (i >= 0) mockTasks.splice(i, 1);
        }
        return respond({ ok: true });
      }
      if (method === "POST") {
        if (body?.content) {
          const ann = { id: realDb ? uid("a") : "a-" + uid("m"), content: body.content, confirmed: false, createdAt: now };
          if (realDb) {
            const list = ovAnns.get(tid) || [];
            list.push(ann);
            ovAnns.set(tid, list);
          } else {
            const t = mockTasks.find((x) => x.id === tid);
            if (t) {
              t.annotations = t.annotations || [];
              t.annotations.push(ann);
            }
          }
          return respond(ann);
        }
        return respond({ ok: true });
      }
    }
  }

  // ---- 批注（挂任务下） ----
  const annMatch = p.match(/^api\/projects\/([^/]+)\/tasks\/([^/]+)\/annotations(?:\/([^/]+))?$/);
  if (annMatch) {
    const tid = annMatch[2];
    const aid = annMatch[3];
    if (!aid && method === "POST") {
      const ann = { id: realDb ? uid("a") : "a-" + uid("m"), content: body?.content || "", confirmed: false, createdAt: now };
      if (realDb) {
        const list = ovAnns.get(tid) || [];
        list.push(ann);
        ovAnns.set(tid, list);
      }
      return respond(ann);
    }
    if (aid && method === "PUT") {
      const ann = realDb ? (ovAnns.get(tid) || []).find((x) => x.id === aid) : null;
      if (ann) {
        if (body?.content !== undefined) ann.content = body.content;
        if (body?.confirmed !== undefined) ann.confirmed = !!body.confirmed;
        return respond(ann);
      }
      return respond({ ok: true });
    }
    if (aid && method === "DELETE") {
      if (realDb && ovAnns.has(tid)) {
        const list = ovAnns.get(tid).filter((x) => x.id !== aid);
        ovAnns.set(tid, list);
      }
      return respond({ ok: true });
    }
    return respond(realDb ? realAnnotations(tid) : []);
  }

  // ---- 文件 ----
  const fileMatch = p.match(/^api\/projects\/([^/]+)\/files(?:\/([^/]+))?$/);
  if (fileMatch) {
    const pid = fileMatch[1];
    const fid = fileMatch[2];
    if (!fid && method === "GET") {
      if (realDb) return respond(realFullProject(pid)?.files || []);
      return respond(mockFiles.filter((f) => f.project_id === pid));
    }
    if (!fid && method === "POST") {
      const f = { id: realDb ? uid("f") : "f-" + uid("m"), project_id: pid, name: body?.name || "示例文件", path: "C:/mock/示例文件", uploadedAt: now };
      if (realDb) ovFiles.set(f.id, f);
      else mockFiles.push(f);
      return respond(f);
    }
    if (fid && method === "DELETE") {
      if (realDb) delFiles.add(fid);
      else {
        const i = mockFiles.findIndex((f) => f.id === fid);
        if (i >= 0) mockFiles.splice(i, 1);
      }
      return respond({ ok: true });
    }
  }

  // ---- 笔记 ----
  const noteMatch = p.match(/^api\/projects\/([^/]+)\/notes(?:\/([^/]+))?$/);
  if (noteMatch) {
    const pid = noteMatch[1];
    const nid = noteMatch[2];
    if (!nid && method === "GET") {
      if (realDb) return respond(realFullProject(pid)?.notes || []);
      return respond(mockNotes.filter((n) => n.project_id === pid));
    }
    if (!nid && method === "POST") {
      const n = { id: realDb ? uid("n") : "n-" + uid("m"), project_id: pid, content: body?.content || "", createdAt: now };
      if (realDb) ovNotes.set(n.id, n);
      else mockNotes.push(n);
      return respond(n);
    }
    if (nid) {
      if (method === "PUT") {
        const n = realDb ? [...ovNotes.values()].find((x) => x.id === nid) : mockNotes.find((x) => x.id === nid);
        if (n && body?.content !== undefined) n.content = body.content;
        return respond(n || { ok: true });
      }
      if (method === "DELETE") {
        if (realDb) delNotes.add(nid);
        else {
          const i = mockNotes.findIndex((x) => x.id === nid);
          if (i >= 0) mockNotes.splice(i, 1);
        }
        return respond({ ok: true });
      }
    }
  }

  return err(`mock 未实现的接口: ${method} ${path}`);
}
