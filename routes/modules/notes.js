/**
 * 项目备注 CRUD：/api/projects/:projectId/notes/*
 */
export function registerNotesRoutes(app, data) {
  app.post("/api/projects/:projectId/notes", async (c) => {
    try {
      const body = await c.req.json();
      const note = data.createNote(c.req.param("projectId"), body);
      return c.json({ ok: true, data: note });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/notes/:noteId", async (c) => {
    try {
      const body = await c.req.json();
      const note = data.updateNote(c.req.param("projectId"), c.req.param("noteId"), body);
      return c.json({ ok: true, data: note });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/notes/:noteId", (c) => {
    try {
      data.deleteNote(c.req.param("projectId"), c.req.param("noteId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}