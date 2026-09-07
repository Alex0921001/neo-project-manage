import http from "../index.js";

/** 临时任务接口模块；返回业务 JSON { ok, data?, error? } */

export function listQuickTasks(params = {}, opts = {}) {
  return http.get("api/quick-tasks", { params, ...opts });
}

export function createQuickTask(data, opts = {}) {
  return http.post("api/quick-tasks", data, opts);
}

export function updateQuickTask(id, data, opts = {}) {
  return http.put(`api/quick-tasks/${id}`, data, opts);
}

export function deleteQuickTask(id, opts = {}) {
  return http.delete(`api/quick-tasks/${id}`, opts);
}

export function archiveQuickTask(id, opts = {}) {
  return http.post(`api/quick-tasks/${id}/archive`, null, opts);
}

/** 批量归档：{ ids } 或 { all: true } */
export function archiveQuickTasks(data, opts = {}) {
  return http.post("api/quick-tasks/archive", data, opts);
}

export function convertQuickTask(id, data, opts = {}) {
  return http.post(`api/quick-tasks/${id}/convert`, data, opts);
}

/** 归档列表（分页 + 关键词） */
export function listArchivedQuickTasks(params = {}, opts = {}) {
  return http.get("api/quick-tasks/archived", { params, ...opts });
}

/** 归档批量清理：body { id } 形式 */
export function deleteArchivedQuickTasks(data, opts = {}) {
  return http.delete("api/quick-tasks/archived", { data, ...opts });
}

/** 归档批量清理：query ?all=1 形式 */
export function deleteArchivedAll(opts = {}) {
  return http.delete("api/quick-tasks/archived", { params: { all: 1 }, ...opts });
}
