/**
 * 批注（便利贴）CRUD：任务级 + 子任务级
 *   /api/projects/:projectId/tasks/:taskId/annotations/*
 *   /api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations/*
 */
import {
  findTask,
  findSubtask,
  ensureField,
  genShortId,
  requireString,
} from "../_helpers.js";

function newAnnotation(body) {
  return {
    id: genShortId(),
    content: requireString(body.content, "批注内容"),
    createdAt: new Date().toISOString(),
    confirmed: false,
    confirmedAt: null,
  };
}

export function registerAnnotationsRoutes(app, { readProjects, writeProjects }) {
  // ===== 任务批注 =====

  app.post("/api/projects/:projectId/tasks/:taskId/annotations", async (c) => {
    try {
      const body = await c.req.json();
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const all = readProjects();
      const { task } = findTask(all, projId, taskId);
      ensureField(task, "annotations");
      const ann = newAnnotation(body);
      task.annotations.push(ann);
      writeProjects(all);
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/annotations/:annId", (c) => {
    try {
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const annId = c.req.param("annId");
      const all = readProjects();
      const { task } = findTask(all, projId, taskId);
      ensureField(task, "annotations");
      const idx = task.annotations.findIndex((a) => a.id === annId);
      if (idx === -1) throw new Error(`批注 ${annId} 不存在`);
      task.annotations.splice(idx, 1);
      writeProjects(all);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/annotations/:annId", async (c) => {
    try {
      const body = await c.req.json();
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const annId = c.req.param("annId");
      const all = readProjects();
      const { task } = findTask(all, projId, taskId);
      ensureField(task, "annotations");
      const ann = task.annotations.find((a) => a.id === annId);
      if (!ann) throw new Error(`批注 ${annId} 不存在`);
      if (body.confirmed !== undefined) {
        ann.confirmed = !!body.confirmed;
        ann.confirmedAt = ann.confirmed ? new Date().toISOString() : null;
      }
      writeProjects(all);
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 子任务批注 =====

  app.post("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations", async (c) => {
    try {
      const body = await c.req.json();
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const subId = c.req.param("subtaskId");
      const all = readProjects();
      const { sub } = findSubtask(all, projId, taskId, subId);
      ensureField(sub, "annotations");
      const ann = newAnnotation(body);
      sub.annotations.push(ann);
      writeProjects(all);
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations/:annId", (c) => {
    try {
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const subId = c.req.param("subtaskId");
      const annId = c.req.param("annId");
      const all = readProjects();
      const { sub } = findSubtask(all, projId, taskId, subId);
      ensureField(sub, "annotations");
      const idx = sub.annotations.findIndex((a) => a.id === annId);
      if (idx === -1) throw new Error(`批注 ${annId} 不存在`);
      sub.annotations.splice(idx, 1);
      writeProjects(all);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations/:annId", async (c) => {
    try {
      const body = await c.req.json();
      const projId = c.req.param("projectId");
      const taskId = c.req.param("taskId");
      const subId = c.req.param("subtaskId");
      const annId = c.req.param("annId");
      const all = readProjects();
      const { sub } = findSubtask(all, projId, taskId, subId);
      const ann = sub.annotations.find((a) => a.id === annId);
      if (!ann) throw new Error(`批注 ${annId} 不存在`);
      if (body.confirmed !== undefined) {
        ann.confirmed = !!body.confirmed;
        ann.confirmedAt = ann.confirmed ? new Date().toISOString() : null;
      }
      writeProjects(all);
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}