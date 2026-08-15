/**
 * 消息中心（V2.3 R1）：GET /api/messages、PUT /api/messages/read、DELETE /api/messages/:id、GET /api/messages/unread-count
 */
export function registerMessagesRoutes(app, data) {
  // 消息列表（先惰性扫描生成新消息，再分页；可按项目/类型筛选，含 total/unread）
  app.get("/api/messages", (c) => {
    try {
      const rawLimit = Number(c.req.query("limit"));
      const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : 20;
      const rawOffset = Number(c.req.query("offset"));
      const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
      const result = data.listMessages({
        projectId: c.req.query("projectId") || undefined,
        type: c.req.query("type") || undefined,
        limit,
        offset,
      });
      return c.json({ ok: true, data: result });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 标记已读（批量）：body { ids: string[] }
  app.put("/api/messages/read", async (c) => {
    try {
      const body = (await c.req.json()) || {};
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return c.json({ ok: false, error: "ids 不能为空" }, 400);
      if (ids.length > 50) return c.json({ ok: false, error: "单次最多标记 50 条消息" }, 400);
      const result = data.markMessageRead(ids);
      return c.json({ ok: true, data: result });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 删除单条消息
  app.delete("/api/messages/:id", (c) => {
    try {
      const result = data.deleteMessage(c.req.param("id"));
      return c.json({ ok: true, data: result });
    } catch (e) {
      if (e.message.includes("不存在")) return c.json({ ok: false, error: e.message }, 404);
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 未读数（先惰性扫描保证新鲜；projectId 可选，不传=全部项目）
  app.get("/api/messages/unread-count", (c) => {
    try {
      const unread = data.getMessageUnreadCount(c.req.query("projectId") || undefined);
      return c.json({ ok: true, data: { unread } });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // V2.3 精修 #7：消息提醒配置读/写
  app.get("/api/messages/config", (c) => {
    try {
      const config = data.getMessageConfig();
      return c.json({ ok: true, data: { config } });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/messages/config", async (c) => {
    try {
      const body = (await c.req.json()) || {};
      const config = data.updateMessageConfig({
        deadlineDays: body.deadlineDays,
        deadlineEnabled: body.deadlineEnabled,
        riskEnabled: body.riskEnabled,
      });
      return c.json({ ok: true, data: { config } });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
