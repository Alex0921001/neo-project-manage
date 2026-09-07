import http from "../index.js";

/** 任务接口模块；返回业务 JSON { ok, data?, error? } */

export function listTasks(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/tasks`, { params, ...opts });
}

export function createTask(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/tasks`, data, opts);
}

export function updateTask(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/tasks/${id}`, data, opts);
}

export function deleteTask(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/tasks/${id}`, opts);
}

export function reorderTasks(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/reorder-tasks`, data, opts);
}

export function moveTask(projectId, id, data, opts = {}) {
  return http.post(`api/projects/${projectId}/tasks/${id}/move`, data, opts);
}

export function reorderSubtasks(projectId, id, data, opts = {}) {
  return http.post(`api/projects/${projectId}/tasks/${id}/reorder-subtasks`, data, opts);
}
