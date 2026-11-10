import http from "../index.js";

/** 项目接口模块；返回业务 JSON { ok, data?, error? } */

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

/** 复制项目：data 为新项目字段，data.copy 控制复制哪些内容 */
export function copyProject(id, data, opts = {}) {
  return http.post(`api/projects/${id}/copy`, data, opts);
}
