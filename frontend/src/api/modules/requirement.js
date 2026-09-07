import http from "../index.js";

/** 需求接口模块（V2.6.4 任务 f74273ee）；返回业务 JSON { ok, data?, error? } */

export function listRequirements(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/requirements`, { params, ...opts });
}

export function getRequirement(projectId, id, opts = {}) {
  return http.get(`api/projects/${projectId}/requirements/${id}`, opts);
}

export function createRequirement(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/requirements`, data, opts);
}

export function updateRequirement(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/requirements/${id}`, data, opts);
}

export function updateRequirementStatus(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/requirements/${id}/status`, data, opts);
}

export function deleteRequirement(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/requirements/${id}`, opts);
}
