/**
 * 验证模块（V2.6.1）：验证卡 + 卡内验证项，/api/projects/:projectId/verifications/*
 *
 * GET    /api/projects/:projectId/verifications                          验证卡列表（分页 20，含进度与关联任务名）
 * POST   /api/projects/:projectId/verifications                          新建验证卡 { name, taskIds?, note? }
 * PUT    /api/projects/:projectId/verifications/:id                      编辑验证卡 { name?, taskIds?, note? }
 * DELETE /api/projects/:projectId/verifications/:id                      删除验证卡（级联删验证项）
 * GET    /api/projects/:projectId/verifications/:id/items                验证项清单
 * POST   /api/projects/:projectId/verifications/:id/items                新建验证项 { category?, content, note? }
 * PUT    /api/projects/:projectId/verifications/items/:itemId            编辑验证项 { content?, note?, category? }
 * POST   /api/projects/:projectId/verifications/items/:itemId/toggle     勾选/退回（落库 + 审计）
 * DELETE /api/projects/:projectId/verifications/items/:itemId            删除验证项
 *
 * 全量审计；验证卡名称/备注进 FTS。
 */
export function registerVerificationsRoutes(app, data) {
  app.get("/api/projects/:projectId/verifications", (c) => {
    try {
      return c.json({
        ok: true,
        data: data.listVerifications(c.req.param("projectId"), {
          page: Number(c.req.query("page")) || 1,
          pageSize: Number(c.req.query("pageSize")) || 20,
          keyword: c.req.query("keyword") || undefined,
          planId: c.req.query("planId") || undefined,
          taskId: c.req.query("taskId") || undefined,
        }),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/verifications", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.createVerification(c.req.param("projectId"), body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.put("/api/projects/:projectId/verifications/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.updateVerification(c.req.param("projectId"), c.req.param("id"), body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.delete("/api/projects/:projectId/verifications/:id", (c) => {
    try {
      data.deleteVerification(c.req.param("projectId"), c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.get("/api/projects/:projectId/verifications/:id/items", (c) => {
    try {
      return c.json({
        ok: true,
        data: data.listVerificationItems(c.req.param("projectId"), c.req.param("id")),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.post("/api/projects/:projectId/verifications/:id/items", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({
        ok: true,
        data: data.createVerificationItem(c.req.param("projectId"), c.req.param("id"), body),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.put("/api/projects/:projectId/verifications/items/:itemId", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({
        ok: true,
        data: data.updateVerificationItem(c.req.param("projectId"), c.req.param("itemId"), body),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.post("/api/projects/:projectId/verifications/items/:itemId/toggle", (c) => {
    try {
      return c.json({
        ok: true,
        data: data.toggleVerificationItem(c.req.param("projectId"), c.req.param("itemId")),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.delete("/api/projects/:projectId/verifications/items/:itemId", (c) => {
    try {
      data.deleteVerificationItem(c.req.param("projectId"), c.req.param("itemId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });
}
