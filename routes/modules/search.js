/**
 * 全文检索（V2.3 R2）：GET /api/search?keyword=&projectId=&type=&limit=
 */
export function registerSearchRoutes(app, data) {
  app.get("/api/search", (c) => {
    try {
      const rawLimit = Number(c.req.query("limit"));
      const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : 20;
      const result = data.searchAll(c.req.query("keyword") || "", {
        projectId: c.req.query("projectId") || undefined,
        type: c.req.query("type") || undefined,
        limit,
      });
      return c.json({ ok: true, data: result });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
