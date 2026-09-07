import http from "../index.js";

/** 项目集接口模块；返回业务 JSON { ok, data?, error? } */

export function listProjectSets(params = {}, opts = {}) {
  return http.get("api/project-sets", { params, ...opts });
}

export function getProjectSet(id, opts = {}) {
  return http.get(`api/project-sets/${id}`, opts);
}

export function createProjectSet(data, opts = {}) {
  return http.post("api/project-sets", data, opts);
}

export function updateProjectSet(id, data, opts = {}) {
  return http.put(`api/project-sets/${id}`, data, opts);
}

export function deleteProjectSet(id, opts = {}) {
  return http.delete(`api/project-sets/${id}`, opts);
}

export function reorderProjectSets(data, opts = {}) {
  return http.post("api/project-sets/reorder", data, opts);
}
