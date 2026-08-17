/**
 * Task CRUD (tree structure)
 */
export function registerTasksRoutes(app, data) {
  // List tasks (flat, with status / assignee / keyword / dateRange filters)
  app.get("/api/projects/:projectId/tasks", (c) => {
    try {
      const status = c.req.query("status") || "all";
      const assignee = c.req.query("assignee") || "";
      const keyword = c.req.query("keyword") || "";
      const dateRange = c.req.query("dateRange") || "";
      const tasks = data.listTasks(c.req.param("projectId"), { status, assignee, keyword, dateRange });
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // Create task (supports parentTaskId)
  app.post("/api/projects/:projectId/tasks", async (c) => {
    try {
      const body = await c.req.json();
      const task = data.createTask(c.req.param("projectId"), body);
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // Update task
  app.put("/api/projects/:projectId/tasks/:taskId", async (c) => {
    try {
      const body = await c.req.json();
      const task = data.updateTask(c.req.param("projectId"), c.req.param("taskId"), body);
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // V2.2 R7：批量更新任务（body: { tasks: [{id, ...可改字段}] }，逐条独立，返回成功/失败清单）
  app.post("/api/projects/:projectId/tasks/batch-update", async (c) => {
    try {
      const body = await c.req.json();
      const result = data.updateTasks(c.req.param("projectId"), body.tasks);
      return c.json({ ok: true, data: result });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // Delete task (CASCADE)
  app.delete("/api/projects/:projectId/tasks/:taskId", (c) => {
    try {
      data.deleteTask(c.req.param("projectId"), c.req.param("taskId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // Reorder top-level
  app.post("/api/projects/:projectId/reorder-tasks", async (c) => {
    try {
      const body = await c.req.json();
      const tasks = data.reorderTasks(c.req.param("projectId"), body.taskIds);
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // Reorder subtasks
  app.post("/api/projects/:projectId/tasks/:taskId/reorder-subtasks", async (c) => {
    try {
      const body = await c.req.json();
      const tasks = data.reorderSubtasks(
        c.req.param("projectId"),
        c.req.param("taskId"),
        body.subtaskIds
      );
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // Move task to another parent / position (拖拽变更父级)
  app.post("/api/projects/:projectId/tasks/:taskId/move", async (c) => {
    try {
      const body = await c.req.json();
      const tasks = data.moveTask(
        c.req.param("projectId"),
        c.req.param("taskId"),
        body.parentTaskId ?? null,
        body.index ?? 0
      );
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
