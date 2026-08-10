/**
 * 批注（便利贴）CRUD
 *
 * 树形任务结构后，批注只挂在 task_id 上（任意层级）
 *   /api/projects/:projectId/tasks/:taskId/annotations/*
 *
 * 兼容旧路径：/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations/*
 *   （subtaskId 直接当 taskId 用）
 */
export function registerAnnotationsRoutes(app, data) {
  // ===== 新路径：任意层级的任务 =====

  app.post("/api/projects/:projectId/tasks/:taskId/annotations", async (c) => {
    try {
      const body = await c.req.json();
      const ann = data.createAnnotation(
        c.req.param("projectId"),
        c.req.param("taskId"),
        body
      );
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/annotations/:annId", async (c) => {
    try {
      const body = await c.req.json();
      const ann = data.updateAnnotation(c.req.param("taskId"), c.req.param("annId"), body);
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/annotations/:annId", (c) => {
    try {
      data.deleteAnnotation(c.req.param("projectId"), c.req.param("taskId"), c.req.param("annId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/projects/:projectId/tasks/:taskId/annotations", (c) => {
    try {
      const kind = c.req.query("kind") || undefined;
      const list = data.getTaskAnnotations(c.req.param("taskId"), kind);
      return c.json({ ok: true, data: list });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 批量操作 =====

  // 批量创建批注（body: { items: [{ content, kind? }] }，最多 50 个）
  app.post("/api/projects/:projectId/tasks/:taskId/annotations/batch", async (c) => {
    try {
      const body = await c.req.json();
      const anns = data.createAnnotations(
        c.req.param("projectId"),
        c.req.param("taskId"),
        body.items
      );
      return c.json({ ok: true, data: anns });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 批量删除批注（body: { ids: string[] }，最多 50 个）
  app.delete("/api/projects/:projectId/tasks/:taskId/annotations/batch", async (c) => {
    try {
      const body = await c.req.json();
      const result = data.deleteAnnotations(
        c.req.param("projectId"),
        c.req.param("taskId"),
        body.ids
      );
      return c.json({ ok: true, data: result });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 兼容旧子任务路径（subtaskId 直接当 taskId 用）=====

  app.post("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations", async (c) => {
    try {
      const body = await c.req.json();
      const ann = data.createAnnotation(
        c.req.param("projectId"),
        c.req.param("subtaskId"),
        body
      );
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations/:annId", async (c) => {
    try {
      const body = await c.req.json();
      const ann = data.updateAnnotation(c.req.param("subtaskId"), c.req.param("annId"), body);
      return c.json({ ok: true, data: ann });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations/:annId", (c) => {
    try {
      data.deleteAnnotation(c.req.param("projectId"), c.req.param("subtaskId"), c.req.param("annId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}