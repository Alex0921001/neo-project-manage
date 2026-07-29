/**
 * 项目备注 CRUD：/api/projects/:projectId/notes/*
 */
import { findProject, genShortId, requireString } from "../_helpers.js";

export function registerNotesRoutes(app, { readProjects, writeProjects }) {
  app.post("/api/projects/:projectId/notes", async (c) => {
    try {
      const body = await c.req.json();
      const projectId = c.req.param("projectId");
      const all = readProjects();
      const proj = findProject(all, projectId);
      if (!proj.notes) proj.notes = [];
      const note = {
        id: genShortId(),
        content: requireString(body.content, "备注内容"),
        createdAt: new Date().toISOString().slice(0, 10),
      };
      proj.notes.push(note);
      writeProjects(all);
      return c.json({ ok: true, data: note });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/notes/:noteId", async (c) => {
    try {
      const body = await c.req.json();
      const projectId = c.req.param("projectId");
      const noteId = c.req.param("noteId");
      const all = readProjects();
      const proj = findProject(all, projectId);
      const note = (proj.notes || []).find((n) => n.id === noteId);
      if (!note) throw new Error("备注不存在");
      note.content = requireString(body.content, "备注内容");
      writeProjects(all);
      return c.json({ ok: true, data: note });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/notes/:noteId", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const noteId = c.req.param("noteId");
      const all = readProjects();
      const proj = findProject(all, projectId);
      if (proj.notes) {
        proj.notes = proj.notes.filter((n) => n.id !== noteId);
        writeProjects(all);
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}