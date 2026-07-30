/**
 * 项目文件 CRUD：/api/projects/:projectId/files/*
 */
export function registerFilesRoutes(app, data) {
  app.post("/api/projects/:projectId/files", async (c) => {
    try {
      const body = await c.req.json();
      const file = data.addFile(c.req.param("projectId"), body.path);
      return c.json({ ok: true, data: file });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/files/:fileId", (c) => {
    try {
      data.deleteFile(c.req.param("projectId"), c.req.param("fileId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}