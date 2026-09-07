import http from "../index.js";

/** 项目接口模块（V2.6.4 范式模块，任务 818c9917）；返回业务 JSON { ok, data?, error? } */

export function listProjects(params = {}, opts = {}) {
  return http.get("api/projects", { params, ...opts });
}

export function getProject(id, params = {}, opts = {}) {
  return http.get(`api/projects/${id}`, { params, ...opts });
}

export function createProject(data, opts = {}) {
  return http.post("api/projects", data, opts);
}

export function updateProject(id, data, opts = {}) {
  return http.put(`api/projects/${id}`, data, opts);
}

export function deleteProject(id, opts = {}) {
  return http.delete(`api/projects/${id}`, opts);
}
