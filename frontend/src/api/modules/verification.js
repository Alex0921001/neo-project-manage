import http from "../index.js";

/** 验证模块接口；返回业务 JSON { ok, data?, error? } */

// ===== 验证卡 =====

export function listVerifications(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/verifications`, { params, ...opts });
}

export function createVerification(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/verifications`, data, opts);
}

export function updateVerification(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/verifications/${id}`, data, opts);
}

export function deleteVerification(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/verifications/${id}`, opts);
}

// ===== 验证项 =====

export function listVerificationItems(projectId, verificationId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/verifications/${verificationId}/items`, { params, ...opts });
}

export function createVerificationItems(projectId, verificationId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/verifications/${verificationId}/items`, data, opts);
}

export function updateVerificationItem(projectId, itemId, data, opts = {}) {
  return http.put(`api/projects/${projectId}/verifications/items/${itemId}`, data, opts);
}

export function toggleVerificationItem(projectId, itemId, opts = {}) {
  return http.post(`api/projects/${projectId}/verifications/items/${itemId}/toggle`, null, opts);
}

export function deleteVerificationItem(projectId, itemId, opts = {}) {
  return http.delete(`api/projects/${projectId}/verifications/items/${itemId}`, opts);
}

export function clearVerificationGroup(projectId, verificationId, category, opts = {}) {
  return http.delete(`api/projects/${projectId}/verifications/${verificationId}/items`, { params: { category }, ...opts });
}

// ===== 验证分类 =====

export function listVerificationCategories(projectId, opts = {}) {
  return http.get(`api/projects/${projectId}/verification-categories`, opts);
}

export function createVerificationCategory(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/verification-categories`, data, opts);
}

export function updateVerificationCategory(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/verification-categories/${id}`, data, opts);
}

export function deleteVerificationCategory(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/verification-categories/${id}`, opts);
}
