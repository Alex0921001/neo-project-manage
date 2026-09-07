import http from "../index.js";

/** 版本快照接口模块；返回业务 JSON { ok, data?, error? } */

export function listVersions(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/versions`, { params, ...opts });
}

export function restoreVersion(projectId, versionId, params = {}, opts = {}) {
  return http.post(`api/projects/${projectId}/versions/${versionId}/restore`, null, { params, ...opts });
}
