/**
 * 临时任务 CRUD：/api/quick-tasks/*
 *
 * - 全局独立存储，不关联项目
 * - 状态机与业务规则统一收口在 lib/data.js，路由层只做参数透传
 */
export function registerQuickTasksRoutes(app, data) {
  // 主列表（active + done + converted，全量不分页）
  app.get("/api/quick-tasks", (c) => {
    try {
      return c.json({ ok: true, data: data.listQuickTasks() });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/quick-tasks", async (c) => {
    try {
      const body = await c.req.json();
      return c.json({ ok: true, data: data.createQuickTask(body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 更新：编辑内容 / 完成（action=complete）/ 退回（action=reopen）
  app.put("/api/quick-tasks/:id", async (c) => {
    try {
      const body = await c.req.json();
      return c.json({ ok: true, data: data.updateQuickTask(c.req.param("id"), body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 删除归档数据：?all=1 或 body { id }（必须注册在 DELETE /:id 之前，避免 archived 被 :id 抢占）
  app.delete("/api/quick-tasks/archived", async (c) => {
    try {
      let params;
      if (c.req.query("all") === "1") {
        params = { all: true };
      } else {
        params = await c.req.json();
      }
      return c.json({ ok: true, data: data.deleteArchivedQuickTasks(params) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 删除（仅 active 草稿；done/converted 需先归档）
  app.delete("/api/quick-tasks/:id", (c) => {
    try {
      data.deleteQuickTask(c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 单条归档
  app.post("/api/quick-tasks/:id/archive", (c) => {
    try {
      return c.json({ ok: true, data: data.archiveQuickTask(c.req.param("id")) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 批量归档：{ ids: [] } 或 { all: true }
  app.post("/api/quick-tasks/archive", async (c) => {
    try {
      const body = await c.req.json();
      return c.json({ ok: true, data: data.archiveQuickTasks(body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 归档列表（后端分页 + keyword 模糊搜索）
  app.get("/api/quick-tasks/archived", (c) => {
    try {
      return c.json({
        ok: true,
        data: data.listArchivedQuickTasks({
          page: c.req.query("page"),
          pageSize: c.req.query("pageSize"),
          keyword: c.req.query("keyword"),
        }),
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 转正式任务（事务：建任务 + 回写转化去向）
  app.post("/api/quick-tasks/:id/convert", async (c) => {
    try {
      const body = await c.req.json();
      return c.json({ ok: true, data: data.convertQuickTask(c.req.param("id"), body) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
