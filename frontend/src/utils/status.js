import dayjs from "dayjs";

/**
 * 展示用状态计算：前端展示，不修改后端数据。
 *
 * 判断顺序：
 *   1) 已完成 → 不可能逾期
 *   2) 待开始 + planStart 已过 → 已延期
 *   3) 进行中 + planEnd 已过 → 已延期
 *   4) 其余 → 返回 raw status
 *
 * 日期边界（用 dayjs）：
 *   planStart "YYYY-MM-DD" → 本地当天 00:00
 *   planEnd   "YYYY-MM-DD" → 本地当天 23:59:59.999（含当天）
 */
export function computeDisplayStatus(project) {
  if (!project) return "待开始";
  if (project.status === "已完成") return "已完成";
  if (project.status === "已取消") return "已取消";

  const now = dayjs();

  if (
    project.status === "待开始" &&
    project.planStart &&
    now.isAfter(dayjs(project.planStart).startOf("day"))
  ) {
    return "已延期";
  }

  if (
    project.status === "进行中" &&
    project.planEnd &&
    now.isAfter(dayjs(project.planEnd).endOf("day"))
  ) {
    return "已延期";
  }

  return project.status || "待开始";
}