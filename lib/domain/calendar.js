// 日历任务（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createCalendarModule(ctx) {
  const { db, parseAssignees } = ctx;
  // ===== 日历任务（任务日历 tab 数据源）=====

  /**
   * 列出有起止日期的任务（日历事件源）
   * @param {string} status done=已完成 / undone=未完成 / all=全部（默认 undone）
   * @param {string|undefined} projectId 限定项目（可选）
   * @returns {Array<{id,name,startDate,endDate,projectId,done,parentTaskId,assignees,projectName,projectSetId}>}
   */
  function listCalendarTasks(status = "undone", projectId) {
    const where = ["(t.start_date IS NOT NULL OR t.end_date IS NOT NULL)"];
    const params = [];
    if (projectId) {
      where.push("t.project_id = ?");
      params.push(projectId);
    }
    if (status === "done") where.push("t.done = 1");
    else if (status === "undone") where.push("t.done = 0");
    const rows = db.prepare(`
      SELECT t.id, t.project_id, t.parent_task_id, t.name, t.done, t.assignees, t.start_date, t.end_date, t.is_milestone,
             p.name AS project_name, p.project_set_id
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(t.start_date, t.end_date)
    `).all(...params);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date || "",
      endDate: r.end_date || "",
      projectId: r.project_id,
      done: !!r.done,
      parentTaskId: r.parent_task_id,
      assignees: parseAssignees(r.assignees),
      isMilestone: !!r.is_milestone,
      projectName: r.project_name,
      projectSetId: r.project_set_id || "",
    }));
  }
  return {
    listCalendarTasks,
  };
}
