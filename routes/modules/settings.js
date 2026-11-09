// 通用设置路由
// 项目状态分组配置：全局一份，读写走 settings 表（key = projectStatusGroups）
export function registerSettingsRoutes(app, data) {
  // 读分组配置（旧配置/脏值由 normalizeStatusGroups 归一）
  app.get("/api/settings/project-status-groups", (c) => {
    try {
      const config = data.getProjectStatusGroups();
      return c.json({ ok: true, data: { config } });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 整份覆盖写分组配置：body 即完整配置对象（order / visible / limit）
  app.put("/api/settings/project-status-groups", async (c) => {
    try {
      const body = (await c.req.json()) || {};
      const config = data.updateProjectStatusGroups(body);
      return c.json({ ok: true, data: { config } });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
