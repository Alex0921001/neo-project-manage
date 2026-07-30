/**
 * 任务 CRUD（树形结构）
 *
 * 路由：
 *   POST   /api/projects/:projectId/tasks                     - 创建任务（顶层或带 parentTaskId）
 *   PUT    /api/projects/:projectId/tasks/:taskId             - 更新任务
 *   DELETE /api/projects/:projectId/tasks/:taskId             - 删任务（CASCADE 删后代）
 *   POST   /api/projects/:projectId/reorder-tasks             - 重排顶层任务
 *   POST   /api/projects/:projectId/tasks/:taskId/reorder-subtasks - 重排某任务下子任务
 *   POST   /api/projects/:projectId/tasks/:taskId/subtasks    - 兼容旧 API：在某任务下建子任务
 *   PUT    /api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId - 兼容旧 API
 *   DELETE /api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId - 兼容旧 API
 */
export function registerTasksRoutes(app, data) {
  // ===== 创建任务（统一入口，支持 parentTaskId）=====
  app.post("/api/projects/:projectId/tasks", async (c) => {
    try {
      const body = await c.req.json();
      const task = data.createTask(c.req.param("projectId"), body);
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 更新任务 =====
  app.put("/api/projects/:projectId/tasks/:taskId", async (c) => {
    try {
      const body = await c.req.json();
      const task = data.updateTask(c.req.param("projectId"), c.req.param("taskId"), body);
      return c.json({ ok: true, data: task });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 删任务（CASCADE 删所有后代）=====
  app.delete("/api/projects/:projectId/tasks/:taskId", (c) => {
    try {
      data.deleteTask(c.req.param("projectId"), c.req.param("taskId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 重排顶层任务 =====
  app.post("/api/projects/:projectId/reorder-tasks", async (c) => {
    try {
      const body = await c.req.json();
      const tasks = data.reorderTasks(c.req.param("projectId"), body.taskIds);
      return c.json({ ok: true, data: tasks });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 重排某任务下的子任务 =====
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

  // ===== 兼容旧 API =====

  // 在某任务下创建子任务（旧 POST subtasks）→ 新建带 parentTaskId 的任务
  app.post("/api/projects/:projectId/tasks/:taskId/subtasks", async (c) => {
    try {
      const body = await c.req.json();
      const sub = data.createSubTask(
        c.req.param("projectId"),
        c.req.param("taskId"),
        body
      );
      return c.json({ ok: true, data: sub });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.put("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId", async (c) => {
    try {
      const body = await c.req.json();
      const sub = data.updateSubTask(
        c.req.param("projectId"),
        c.req.param("taskId"),
        c.req.param("subtaskId"),
        body
      );
      return c.json({ ok: true, data: sub });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/subtasks/:subtaskId", (c) => {
    try {
      data.deleteSubTask(
        c.req.param("projectId"),
        c.req.param("taskId"),
        c.req.param("subtaskId")
      );
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}