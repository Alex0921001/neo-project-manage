import fs from "node:fs";
import path from "node:path";

/**
 * 共享 helper：绕过 data.js 的 ESM 缓存问题，
 * 直接读写 projects.json（用于子任务、批注、文件、备注等内联路由）。
 */
export function makeProjectsIO(dataDir) {
  const PROJS_PATH = path.join(dataDir, "projects.json");
  function readProjects() {
    try {
      const raw = fs.readFileSync(PROJS_PATH, "utf-8").trim();
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function writeProjects(items) {
    fs.mkdirSync(path.dirname(PROJS_PATH), { recursive: true });
    fs.writeFileSync(PROJS_PATH, JSON.stringify(items, null, 2), "utf-8");
  }
  return { PROJS_PATH, readProjects, writeProjects };
}

/**
 * 确保对象的字段为数组（常用于 annotations、subtasks）
 */
export function ensureField(obj, key) {
  if (!obj[key]) obj[key] = [];
}

/**
 * 在项目数组中查找指定项目，未找到抛错
 */
export function findProject(all, projId) {
  const proj = all.find((p) => p.id === projId);
  if (!proj) throw new Error(`项目 ${projId} 不存在`);
  return proj;
}

/**
 * 在项目数组中查找项目 + 任务，返回 { proj, task }
 */
export function findTask(all, projId, taskId) {
  const proj = findProject(all, projId);
  const task = (proj.tasks || []).find((t) => t.id === taskId);
  if (!task) throw new Error(`任务 ${taskId} 不存在`);
  return { proj, task };
}

/**
 * 在项目数组中查找项目 + 任务 + 子任务，返回 { proj, task, sub }
 */
export function findSubtask(all, projId, taskId, subId) {
  const { proj, task } = findTask(all, projId, taskId);
  ensureField(task, "subtasks");
  const sub = task.subtasks.find((s) => s.id === subId);
  if (!sub) throw new Error(`子任务 ${subId} 不存在`);
  return { proj, task, sub };
}

/**
 * 通用 8 位短 id 生成（UUID 截断）
 */
export function genShortId() {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * 校验必填字符串字段，空值抛错
 */
export function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  return value.trim();
}