/**
 * 方案状态 → 展示 key（V2.1 方案管理）
 * 颜色对齐项目状态色系：草稿=中性灰 / 进行中=蓝 / 已采纳=绿 / 已废弃=红
 */
export function planStatusKey(st) {
  return { 草稿: "draft", 进行中: "doing", 已采纳: "done", 已废弃: "abandoned" }[st] || "draft";
}

export const PLAN_STATUS_OPTIONS = ["草稿", "进行中", "已采纳", "已废弃"];
