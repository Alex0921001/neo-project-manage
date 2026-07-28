/**
 * 展示用状态计算：把 raw status + 日期推导出 "已延期" 等展示值。
 * 与后端 lib/data.js 的 computeStatus 保持一致。
 */
export function computeDisplayStatus(project) {
  if (!project) return "待开始";
  if (project.status === "已完成") return "已完成";
  const now = Date.now();
  const start = project.planStart ? new Date(project.planStart).getTime() : null;
  const end = project.planEnd ? new Date(project.planEnd).getTime() : null;
  if (project.status === "待开始" && start && now > start) return "已延期";
  if (project.status === "进行中" && end && now > end) return "已延期";
  return project.status || "待开始";
}