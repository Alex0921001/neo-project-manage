import http from "../index.js";

/** 消息中心接口模块（V2.6.4 任务 f74273ee）；返回业务 JSON { ok, data?, error? } */

export function listMessages(params = {}, opts = {}) {
  return http.get("api/messages", { params, ...opts });
}

export function deleteMessage(id, opts = {}) {
  return http.delete(`api/messages/${id}`, opts);
}

export function markMessagesRead(data, opts = {}) {
  return http.put("api/messages/read", data, opts);
}

export function getMessageConfig(opts = {}) {
  return http.get("api/messages/config", opts);
}

export function updateMessageConfig(data, opts = {}) {
  return http.put("api/messages/config", data, opts);
}

export function getUnreadCount(params = {}, opts = {}) {
  return http.get("api/messages/unread-count", { params, ...opts });
}
