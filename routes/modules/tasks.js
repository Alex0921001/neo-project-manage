/**
 * Task CRUD (tree structure)
 */
export function registerTasksRoutes(app, data) {
  // NOTE: test routes to verify function execution
  app.get("/api/__tasks_test__", (c) => c.json({ ok: true, msg: "tasks.js GET ok" }));
  app.post("/api/__tasks_test__", (c) => c.json({ ok: true, msg: "tasks.js POST ok" }));
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
