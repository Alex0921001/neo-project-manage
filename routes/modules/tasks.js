/**
 * 任务 + 子任务 CRUD：
 *   /api/projects/:projectId/tasks/*
 *   /api/projects/:projectId/tasks/:taskId/subtasks/*
 *
 * 子任务路由直接读写 JSON（绕过 data.js 的 ESM 缓存问题，保证 fileRefs 同步）
 */
import {
  findTask,
  findSubtask,
  ensureField,
  genShortId,
  requireString,
} from "../_helpers.js";

export function registerTasksRoutes(app, data, { readProjects, writeProjects }) {
  // ===== 任务 =====

  app.post("/api/projects/:projectId/tasks", async (c) => {
    try {
      const body = await c.req.json();
      const task = data.createTask(c.req.param("projectId"), body);
      // 内联处理 fileRefs（避免 ESM 缓存问题）
      if (body.fileRefs) {
        const all = readProjects();
        const proj = all.find((p) => p.id === c.req.param("projectId"));
        const t = proj?.tasks?.find((tk) => tk.id === task.id);
        if (t) { t.fileRefs = body.fileRefs; writeProjects(all); task.fileRefs = body.fileRefs; }
      }
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId", async (c) => {
    try {
      const body = await c.req.json();
      const task = data.updateTask(c.req.param("projectId"), c.req.param("taskId"), body);
      if (body.fileRefs !== undefined) {
        const all = readProjects();
        const proj = all.find((p) => p.id === c.req.param("projectId"));
        const t = proj?.tasks?.find((tk) => tk.id === c.req.param("taskId"));
        if (t) { t.fileRefs = body.fileRefs; writeProjects(all); task.fileRefs = body.fileRefs; }
      }
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

  // ===== 子任务 =====

  app.post("/api/projects/:projectId/tasks/:taskId/subtasks", async (c) => {
    try {
      const body = await c.req.json();
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const all = readProjects();
      const { task } = findTask(all, projId, taskId);
      ensureField(task, "subtasks");
      const sub = {
        id: genShortId(),
        name: requireString(body.name, "子任务名称"),
        description: body.description || "",
        done: false,
        fileRefs: body.fileRefs || [],
      };
      task.subtasks.push(sub);
      writeProjects(all);
      return c.json({ ok: true, data: sub });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId", async (c) => {
    try {
      const body = await c.req.json();
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const subId = c.req.param("subtaskId");
      const all = readProjects();
      const { sub } = findSubtask(all, projId, taskId, subId);
      if (body.name !== undefined) sub.name = requireString(body.name, "子任务名称");
      if (body.description !== undefined) sub.description = body.description;
      if (body.done !== undefined) sub.done = body.done;
      if (body.fileRefs !== undefined) sub.fileRefs = body.fileRefs;
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
      const { task } = findTask(all, projId, taskId);
      ensureField(task, "subtasks");
      const idx = task.subtasks.findIndex((s) => s.id === subId);
      if (idx === -1) throw new Error(`子任务 ${subId} 不存在`);
      task.subtasks.splice(idx, 1);
      writeProjects(all);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}