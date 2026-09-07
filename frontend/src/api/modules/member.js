import http from "../index.js";

/** 全局成员接口模块；返回业务 JSON { ok, data?, error? } */

export function listMembers(params = {}, opts = {}) {
  return http.get("api/members", { params, ...opts });
}

export function listAllKnownNames(opts = {}) {
  return http.get("api/members/all-known", opts);
}

export function createMember(data, opts = {}) {
  return http.post("api/members", data, opts);
}

export function updateMember(id, data, opts = {}) {
  return http.put(`api/members/${id}`, data, opts);
}

export function deleteMember(id, opts = {}) {
  return http.delete(`api/members/${id}`, opts);
}
