import http from "../index.js";

/**
 * 项目接口模块（V2.6.4 范式模块，任务 818c9917）
 * 返回业务 JSON { ok, data?, error? }，与旧 api() 形态一致
 */

export function listProjects(params = {}) {
  return http.get("api/projects", { params });
}

export function getProject(id, params = {}) {
  return http.get(`api/projects/${id}`, { params });
}

export function createProject(data) {
  return http.post("api/projects", data);
}

export function updateProject(id, data) {
  return http.put(`api/projects/${id}`, data);
}

export function deleteProject(id) {
  return http.delete(`api/projects/${id}`);
}
