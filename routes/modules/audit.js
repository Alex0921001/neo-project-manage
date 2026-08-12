/**
 * 审计日志：GET /api/projects/:projectId/audit-logs
 */
export function registerAuditRoutes(app, data) {
  // V2.1 审计追踪：按项目查审计日志（倒序分页，可选筛选）
  // P1-1：limit/offset 仅接受正整数/非负整数，非法回退默认（50/0），避免 data 层抛错裸 500
  app.get("/api/projects/:projectId/audit-logs", (c) => {
    try {
      const rawLimit = Number(c.req.query("limit"));
      const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : 50;
      const rawOffset = Number(c.req.query("offset"));
      const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
      const action = c.req.query("action") || undefined;
      const targetType = c.req.query("targetType") || undefined;
      const keyword = c.req.query("keyword") || undefined;
      const result = data.listAuditLogs(c.req.param("projectId"), { limit, offset, action, targetType, keyword });
      return c.json({ ok: true, data: result });
    } catch (e) {
      // 项目不存在 → 404（与 GET /api/projects/:id 语义一致），其余错误 → 400
      if (e.message.includes("不存在")) return c.json({ ok: false, error: e.message }, 404);
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
