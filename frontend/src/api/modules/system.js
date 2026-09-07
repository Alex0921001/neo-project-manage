import http from "../index.js";

/** 系统/检索/项目洞察接口模块（V2.6.4 任务 f74273ee）；返回业务 JSON { ok, data?, error? } */

export function searchAll(params = {}, opts = {}) {
  return http.get("api/search", { params, ...opts });
}

export function getCapabilities(opts = {}) {
  return http.get("api/capabilities", opts);
}

export function getVersion(opts = {}) {
  return http.get("api/version", opts);
}

export function listAuditLogs(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/audit-logs`, { params, ...opts });
}

// ===== 项目洞察 =====

export function getRiskConfig(projectId) {
  return http.get(`api/projects/${projectId}/risk-config`, { silent: true });
}

export function updateRiskConfig(projectId, data, opts = {}) {
  return http.put(`api/projects/${projectId}/risk-config`, data, opts);
}

/** 生成项目报告（POST，body 传 range 等） */
export function generateReport(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/report`, data, { silent: true, ...opts });
}

export function getSummary(projectId) {
  return http.get(`api/projects/${projectId}/summary`, { silent: true });
}

export function listSummaries(projectId) {
  return http.get(`api/projects/${projectId}/summaries`, { silent: true });
}
