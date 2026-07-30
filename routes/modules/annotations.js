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
      const ann = data.createAnnotation(c.req.param("taskId"), body);
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
      data.deleteAnnotation(c.req.param("taskId"), c.req.param("annId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/projects/:projectId/tasks/:taskId/annotations", (c) => {
    try {
      const list = data.getTaskAnnotations(c.req.param("taskId"));
      return c.json({ ok: true, data: list });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 兼容旧子任务路径（subtaskId 直接当 taskId 用）=====

  app.post("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/annotations", async (c) => {
    try {
      const body = await c.req.json();
      const ann = data.createAnnotation(c.req.param("subtaskId"), body);
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
      data.deleteAnnotation(c.req.param("subtaskId"), c.req.param("annId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}