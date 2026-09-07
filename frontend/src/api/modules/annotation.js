import http from "../index.js";

/**
 * 批注（便利贴）接口模块
 * 批注挂在任务下：api/projects/:pid/tasks/:taskId/annotations/:annId
 */

function annUrl(projectId, taskId, annId) {
  return `api/projects/${projectId}/tasks/${taskId}/annotations/${annId}`;
}

export function createAnnotation(projectId, taskId, data, opts = {}) {
  return http.post(`api/projects/${projectId}/tasks/${taskId}/annotations`, data, opts);
}

export function updateAnnotation(projectId, taskId, annId, data, opts = {}) {
  return http.put(annUrl(projectId, taskId, annId), data, opts);
}

export function deleteAnnotation(projectId, taskId, annId, opts = {}) {
  return http.delete(annUrl(projectId, taskId, annId), opts);
}
