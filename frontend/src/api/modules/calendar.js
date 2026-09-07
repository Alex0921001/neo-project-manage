import http from "../index.js";

/** 任务日历接口模块；项目级与全局级共用 */

export function listCalendarTasks({ projectId, status } = {}, opts = {}) {
  const params = status ? { status } : {};
  return projectId
    ? http.get(`api/projects/${projectId}/calendar-tasks`, { params, ...opts })
    : http.get("api/calendar-tasks", { params, ...opts });
}
