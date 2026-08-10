/**
 * 项目 CRUD：/api/projects/*
 */
export function registerProjectsRoutes(app, data) {
  app.get("/api/projects", (c) => {
    const projectSetId = c.req.query("projectSetId");
    const keyword = c.req.query("keyword") || "";
    const projects = data.listProjects(projectSetId !== undefined ? projectSetId : undefined, keyword);
    return c.json({ ok: true, data: projects });
  });

  app.get("/api/projects/:id", (c) => {
    const project = data.getProject(c.req.param("id"));
    if (!project) return c.json({ ok: false, error: "项目不存在" }, 404);
    return c.json({ ok: true, data: project });
  });

  // V2.0 S12：项目总结（与 summarize-project 工具同源，数据来自 data.summarizeProject）
  app.get("/api/projects/:id/summary", (c) => {
    const summary = data.summarizeProject(c.req.param("id"));
    if (!summary) return c.json({ ok: false, error: "项目不存在" }, 404);
    return c.json({ ok: true, data: summary });
  });

  // V2.0 S14：历史总结列表（data.getProjectSummaries 倒序取最近 N 条，供前端时间线）
  app.get("/api/projects/:id/summaries", (c) => {
    const project = data.getProject(c.req.param("id"));
    if (!project) return c.json({ ok: false, error: "项目不存在" }, 404);
    const limit = Number(c.req.query("limit")) || 10;
    return c.json({ ok: true, data: data.getProjectSummaries(c.req.param("id"), limit) });
  });

  app.post("/api/projects", async (c) => {
    const body = await c.req.json();
    try {
      const project = data.createProject(body);
      return c.json({ ok: true, data: project });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:id", async (c) => {
    const body = await c.req.json();
    try {
      const project = data.updateProject(c.req.param("id"), body);
      if (!project) return c.json({ ok: false, error: "项目不存在" }, 404);
      return c.json({ ok: true, data: project });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:id", (c) => {
    try {
      data.deleteProject(c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}