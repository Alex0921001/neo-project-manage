/**
 * 成员 CRUD + 历史人名聚合：/api/members/*
 *
 * GET    /api/members            列出全局成员（可按 keyword 过滤）
 * GET    /api/members/all-known  聚合所有已知人名（全局成员 + 历史人名，带 isHistoric 标记）
 * POST   /api/members            新建成员
 * PUT    /api/members/:id        改名
 * DELETE /api/members/:id        删除
 */
export function registerMembersRoutes(app, data) {
  // all-known 先于 /:id 注册（固定路径优先，避免 all-known 被解析为 id）
  app.get("/api/members/all-known", (c) => {
    try {
      const known = data.allKnownNames();
      // 表内成员 = 正式名录；其余 = 历史人名（仅补录候选，不入库）
      const formal = new Set(data.listMembers().map((m) => m.name));
      const list = known.map((name) => ({ name, isHistoric: !formal.has(name) }));
      return c.json({ ok: true, data: list });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/members", (c) => {
    const keyword = c.req.query("keyword") || "";
    const members = data.listMembers().filter((m) => !keyword || m.name.includes(keyword));
    return c.json({ ok: true, data: members });
  });

  app.post("/api/members", async (c) => {
    const body = await c.req.json();
    try {
      const member = data.createMember(body.name);
      return c.json({ ok: true, data: member });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/members/:id", async (c) => {
    const body = await c.req.json();
    try {
      const member = data.renameMember(c.req.param("id"), body.name);
      return c.json({ ok: true, data: member });
    } catch (e) {
      // 不存在 → 404，其余（重名/空名）→ 400
      if (e.message.includes("不存在")) return c.json({ ok: false, error: e.message }, 404);
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/members/:id", (c) => {
    try {
      data.deleteMember(c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      if (e.message.includes("不存在")) return c.json({ ok: false, error: e.message }, 404);
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
