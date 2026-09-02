/**
 * 验证模块（V2.6）：/api/projects/:projectId/verifications/*
 *
 * GET    /api/projects/:projectId/verifications                      清单（?targetType&targetId&category&status 过滤）
 * GET    /api/projects/:projectId/verifications/summary              看板聚合（总进度 + 对象卡片 + 通用组）
 * POST   /api/projects/:projectId/verifications                      新建 { targetType?, targetId?, category?, content, note? }
 * PUT    /api/projects/:projectId/verifications/:id                  编辑 { content?, note?, category? }
 * POST   /api/projects/:projectId/verifications/:id/toggle           勾选/退回（落库 + 审计）
 * DELETE /api/projects/:projectId/verifications/:id                  删除
 * POST   /api/projects/:projectId/verifications/template             模板生成 { templateKey, targetType?, targetId? }
 *
 * 增删改/勾选全量审计（targetType=verification）；内容进 FTS（type=verification）。
 */
export function registerVerificationsRoutes(app, data) {
  app.get("/api/projects/:projectId/verifications", (c) => {
    try {
      return c.json({
        ok: true,
        data: data.listVerifications(c.req.param("projectId"), {
          targetType: c.req.query("targetType") || undefined,
          targetId: c.req.query("targetId") || undefined,
          category: c.req.query("category") || undefined,
          status: c.req.query("status"),
        }),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/projects/:projectId/verifications/summary", (c) => {
    try {
      return c.json({ ok: true, data: data.verificationSummary(c.req.param("projectId")) });
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

  app.post("/api/projects/:projectId/verifications/:id/toggle", (c) => {
    try {
      return c.json({ ok: true, data: data.toggleVerification(c.req.param("projectId"), c.req.param("id")) });
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

  app.post("/api/projects/:projectId/verifications/template", async (c) => {
    const body = await c.req.json();
    try {
      return c.json({ ok: true, data: data.generateFromTemplate(c.req.param("projectId"), body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });
}
