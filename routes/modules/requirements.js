/**
 * 需求管理（V2.1.3）：/api/projects/:projectId/requirements/*
 *
 * GET    /api/projects/:projectId/requirements           需求列表（分页 + status/keyword 筛选，含关联方案数）
 * POST   /api/projects/:projectId/requirements           新建需求（name/description/priority/planIds）
 * GET    /api/projects/:projectId/requirements/:id       需求详情（含关联方案明细）
 * PUT    /api/projects/:projectId/requirements/:id       编辑需求（仅待处理：名称/简述/优先级/关联方案）
 * PUT    /api/projects/:projectId/requirements/:id/status  状态流转（待处理 → 已完成/已取消）
 * DELETE /api/projects/:projectId/requirements/:id       删除需求（级联清关联）
 * POST   /api/projects/:projectId/requirements/:id/plans     批量关联方案
 * DELETE /api/projects/:projectId/requirements/:id/plans     批量解除方案关联
 */
export function registerRequirementsRoutes(app, data) {
  app.get("/api/projects/:projectId/requirements", (c) => {
    try {
      const q = c.req.query();
      const limit = q.limit ? Math.min(Math.max(parseInt(q.limit) || 50, 1), 100) : 50;
      const offset = q.offset ? Math.max(parseInt(q.offset) || 0, 0) : 0;
      const status = q.status ? String(q.status).trim() : undefined;
      const keyword = q.keyword ? String(q.keyword).trim() : undefined;
      return c.json({ ok: true, data: data.listRequirements(c.req.param("projectId"), { limit, offset, status, keyword }) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/requirements", async (c) => {
    const body = await c.req.json();
    try {
      const req = data.createRequirement(c.req.param("projectId"), body);
      return c.json({ ok: true, data: req });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/projects/:projectId/requirements/:id", (c) => {
    try {
      return c.json({ ok: true, data: data.getRequirement(c.req.param("projectId"), c.req.param("id")) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/requirements/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.updateRequirement(c.req.param("projectId"), c.req.param("id"), body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/requirements/:id/status", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.updateRequirementStatus(c.req.param("projectId"), c.req.param("id"), body.status) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/requirements/:id", (c) => {
    try {
      data.deleteRequirement(c.req.param("projectId"), c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/requirements/:id/plans", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.linkRequirementPlans(c.req.param("projectId"), c.req.param("id"), body.planIds) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/requirements/:id/plans", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.unlinkRequirementPlans(c.req.param("projectId"), c.req.param("id"), body.planIds) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
