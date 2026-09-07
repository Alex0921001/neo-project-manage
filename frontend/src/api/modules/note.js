import http from "../index.js";

/** 项目备注接口模块；返回业务 JSON { ok, data?, error? } */

export function createNote(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/notes`, data, opts);
}

export function updateNote(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/notes/${id}`, data, opts);
}

export function deleteNote(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/notes/${id}`, opts);
}
