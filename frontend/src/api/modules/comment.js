import http from "../index.js";

/**
 * 统一评论接口模块（V2.6.4 范式模块，任务 818c9917）
 * 需求/方案共用评论表；返回业务 JSON { ok, data?, error? }
 */

export function listComments(projectId, params = {}) {
  return http.get(`api/projects/${projectId}/comments`, { params });
}

export function addComment(projectId, data) {
  return http.post(`api/projects/${projectId}/comments`, data);
}

export function updateComment(projectId, commentId, data) {
  return http.put(`api/projects/${projectId}/comments/${commentId}`, data);
}

export function deleteComment(projectId, commentId) {
  return http.delete(`api/projects/${projectId}/comments/${commentId}`);
}

/** 划词引用标注写入（绕过状态冻结）；cleanup 用于评论已删后的高亮清理 */
export function applyQuoteAnchor(projectId, commentId, data) {
  return http.post(`api/projects/${projectId}/comments/${commentId}/anchor`, data);
}
