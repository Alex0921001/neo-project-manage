/**
 * 任务日历数据源
 *
 * - GET /api/calendar-tasks?status=done|undone|all  全局：所有项目的有日期任务
 * - GET /api/projects/:projectId/calendar-tasks?status=...  项目级
 *
 * 返回：[{ id, name, startDate, endDate, projectId, done, parentTaskId, assignee, projectName, projectSetId }]
 * 无日期任务不返回（listCalendarTasks 内过滤）
 */
export function registerCalendarRoutes(app, data) {
  app.get("/api/calendar-tasks", (c) => {
    try {
      const status = c.req.query("status") || "undone";
      const tasks = data.listCalendarTasks(status);
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.get("/api/projects/:projectId/calendar-tasks", (c) => {
    try {
      const status = c.req.query("status") || "undone";
      const tasks = data.listCalendarTasks(status, c.req.param("projectId"));
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
