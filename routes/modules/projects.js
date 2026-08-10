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
    try {
      const summary = data.summarizeProject(c.req.param("id"));
      if (!summary) return c.json({ ok: false, error: "项目不存在" }, 404);
      return c.json({ ok: true, data: summary });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // V2.0 S14：历史总结列表（data.getProjectSummaries 倒序取最近 N 条，供前端时间线）
  // P1-1：limit 仅接受正整数，非法（缺失/NaN/小数/负数）退回默认 10，避免 data 层抛错裸 500
  // P2-1：不再前置 getProject 全量查询，存在性由 data 层轻量 SELECT 检查并抛「项目不存在」
  app.get("/api/projects/:id/summaries", (c) => {
    try {
      const rawLimit = Number(c.req.query("limit"));
      const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : 10;
      return c.json({ ok: true, data: data.getProjectSummaries(c.req.param("id"), limit) });
    } catch (e) {
      // 项目不存在 → 404（与 GET /api/projects/:id 语义一致），其余错误 → 400
      if (e.message.includes("不存在")) return c.json({ ok: false, error: e.message }, 404);
      return c.json({ ok: false, error: e.message }, 400);
    }
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