import http from "../index.js";

/** 项目状态分组配置接口模块；返回业务 JSON { ok, data?, error? } */

export function getStatusGroups(opts = {}) {
  return http.get("api/settings/project-status-groups", { silent: true, ...opts });
}

export function updateStatusGroups(data, opts = {}) {
  return http.put("api/settings/project-status-groups", data, { silent: true, ...opts });
}
