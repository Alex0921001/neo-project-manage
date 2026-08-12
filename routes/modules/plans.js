/**
 * 方案管理：/api/projects/:projectId/plans/*
 *
 * GET    /api/projects/:projectId/plans                      方案列表（含评论数/转任务标记）
 * POST   /api/projects/:projectId/plans                      新建方案
 * GET    /api/projects/:projectId/plans/:planId              方案详情（含评论）
 * PUT    /api/projects/:projectId/plans/:planId              编辑方案（标题/内容/状态）
 * DELETE /api/projects/:projectId/plans/:planId              删除方案（级联删评论）
 * POST   /api/projects/:projectId/plans/:planId/comments     加评论
 * DELETE /api/projects/:projectId/plans/:planId/comments/:commentId  删评论
 * POST   /api/projects/:projectId/plans/:planId/convert      一键转任务
 */
export function registerPlansRoutes(app, data) {
  app.get("/api/projects/:projectId/plans", (c) => {
    try {
      return c.json({ ok: true, data: data.listPlans(c.req.param("projectId")) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/plans", async (c) => {
    const body = await c.req.json();
    try {
      const plan = data.createPlan(c.req.param("projectId"), body.title, body.content);
      return c.json({ ok: true, data: plan });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/projects/:projectId/plans/:planId", (c) => {
    try {
      return c.json({ ok: true, data: data.getPlan(c.req.param("projectId"), c.req.param("planId")) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.put("/api/projects/:projectId/plans/:planId", async (c) => {
    const body = await c.req.json();
    try {
      const plan = data.updatePlan(c.req.param("projectId"), c.req.param("planId"), body);
      return c.json({ ok: true, data: plan });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.delete("/api/projects/:projectId/plans/:planId", (c) => {
    try {
      data.deletePlan(c.req.param("projectId"), c.req.param("planId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/plans/:planId/comments", async (c) => {
    const body = await c.req.json();
    try {
      const comment = data.addPlanComment(c.req.param("projectId"), c.req.param("planId"), body.content);
      return c.json({ ok: true, data: comment });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/plans/:planId/comments/:commentId", (c) => {
    try {
      data.deletePlanComment(c.req.param("projectId"), c.req.param("planId"), c.req.param("commentId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/plans/:planId/convert", (c) => {
    try {
      const result = data.convertPlanToTask(c.req.param("projectId"), c.req.param("planId"));
      return c.json({ ok: true, data: result });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
