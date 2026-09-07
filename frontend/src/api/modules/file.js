import http from "../index.js";

/**
 * 文件资产接口模块（V2.6.4 任务 f74273ee）
 * 含宿主系统动作（打开文件/文件夹、文件选择器）
 */

// ===== 文件登记 =====

export function listFiles(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/files`, { params, ...opts });
}

export function registerFile(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/files`, data, opts);
}

export function deleteFile(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/files/${id}`, opts);
}

// ===== 文件夹 =====

export function listFolders(projectId, params = {}, opts = {}) {
  return http.get(`api/projects/${projectId}/folders`, { params, ...opts });
}

export function createFolder(projectId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/folders`, data, opts);
}

export function updateFolder(projectId, id, data, opts = {}) {
  return http.put(`api/projects/${projectId}/folders/${id}`, data, opts);
}

export function deleteFolder(projectId, id, opts = {}) {
  return http.delete(`api/projects/${projectId}/folders/${id}`, opts);
}

// ===== 宿主系统动作 =====

export function openFile(path) {
  return http.get("api/open-file", { params: { path }, silent: true });
}

export function openFolder(path) {
  return http.get("api/open-folder", { params: { path }, silent: true });
}

export function pickFile() {
  return http.get("api/pick-file", { silent: true });
}
