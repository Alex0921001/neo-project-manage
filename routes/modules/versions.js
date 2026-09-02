/**
 * 版本管理（V2.6）：需求/方案共用，/api/projects/:projectId/versions/*
 *
 * GET  /api/projects/:projectId/versions?targetType=&targetId=   版本列表（新→旧，含内容快照）
 * POST /api/projects/:projectId/versions/:versionId/restore       还原到历史版本（旧内容作为新版本存入）
 * PUT  /api/projects/:projectId/versions/:versionId/label         补充版本备注 { label }
 *
 * 自动存版在 updatePlan / updateRequirement 事务内触发（内容实际变化才存）。
 */
export function registerVersionsRoutes(app, data) {
  app.get("/api/projects/:projectId/versions", (c) => {
    const targetType = c.req.query("targetType");
    const targetId = c.req.query("targetId");
    if (!targetType || !targetId) {
      return c.json({ ok: false, error: "targetType 与 targetId 必传" }, 400);
    }
    try {
      return c.json({ ok: true, data: data.listVersions(c.req.param("projectId"), targetType, targetId) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/versions/:versionId/restore", (c) => {
    const body = c.req.query("targetType") ? {} : null;
    try {
      const targetType = c.req.query("targetType") || body?.targetType;
      const targetId = c.req.query("targetId") || body?.targetId;
      if (!targetType || !targetId) {
        return c.json({ ok: false, error: "targetType 与 targetId 必传" }, 400);
      }
      data.restoreVersion(c.req.param("projectId"), targetType, targetId, c.req.param("versionId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.put("/api/projects/:projectId/versions/:versionId/label", async (c) => {
    const body = await c.req.json();
    try {
      data.setVersionLabel(c.req.param("projectId"), c.req.param("versionId"), body.label ?? null);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });
}
