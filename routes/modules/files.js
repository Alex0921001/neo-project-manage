/**
 * 项目文件 CRUD：/api/projects/:projectId/files/*
 */
import { findProject, genShortId } from "../_helpers.js";

export function registerFilesRoutes(app, { readProjects, writeProjects }) {
  app.post("/api/projects/:projectId/files", async (c) => {
    try {
      const body = await c.req.json();
      const projectId = c.req.param("projectId");
      const filePath = body.path;
      if (!filePath || typeof filePath !== "string") {
        throw new Error("缺少文件路径");
      }
      const all = readProjects();
      const proj = findProject(all, projectId);
      if (!proj.files) proj.files = [];
      const name = filePath.split(/[\\/]/).pop() || filePath;
      const file = {
        id: genShortId(),
        name,
        path: filePath,
        uploadedAt: new Date().toISOString().slice(0, 10),
      };
      proj.files.push(file);
      writeProjects(all);
      return c.json({ ok: true, data: file });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/files/:fileId", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const fileId = c.req.param("fileId");
      const all = readProjects();
      const proj = findProject(all, projectId);
      if (proj.files) {
        proj.files = proj.files.filter((f) => f.id !== fileId);
        writeProjects(all);
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}