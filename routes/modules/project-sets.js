/**
 * 项目集 CRUD：/api/project-sets/*
 */
export function registerProjectSetsRoutes(app, data) {
  app.get("/api/project-sets", (c) => {
    const sets = data.listProjectSetsWithCounts();
    return c.json({ ok: true, data: sets });
  });

  // v1.3.1：项目集拖拽排序持久化（先于 :id 路由注册，避免 reorder 被当 id）
  app.post("/api/project-sets/reorder", async (c) => {
    const body = await c.req.json();
    try {
      data.reorderProjectSets(body.ids);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/project-sets", async (c) => {
    const body = await c.req.json();
    try {
      const set = data.createProjectSet(body);
      return c.json({ ok: true, data: set });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/project-sets/:id", async (c) => {
    const body = await c.req.json();
    try {
      const set = data.updateProjectSet(c.req.param("id"), body);
      if (!set) return c.json({ ok: false, error: "项目集不存在" }, 404);
      return c.json({ ok: true, data: set });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/project-sets/:id", (c) => {
    try {
      data.deleteProjectSet(c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}