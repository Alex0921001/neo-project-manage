import http from "../index.js";
import { apiUpload } from "../upload.js";

/** 方案接口模块（V2.6.4 任务 f74273ee）；返回业务 JSON { ok, data?, error? } */

export function listPlans(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/plans`, { params, ...opts });
}

export function getPlan(projectId, id, opts = {}) {
  return http.get(`api/projects/${projectId}/plans/${id}`, opts);
}

export function createPlan(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/plans`, data, opts);
}

export function updatePlan(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/plans/${id}`, data, opts);
}

export function deletePlan(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/plans/${id}`, opts);
}

export function convertPlan(projectId, id, opts = {}) {
  return http.post(`api/projects/${projectId}/plans/${id}/convert`, null, opts);
}

/** 本地文件导入方案（txt/md/docx） */
export function importPlanFile(projectId, formData) {
  return apiUpload(`api/projects/${projectId}/plans/import`, formData);
}
