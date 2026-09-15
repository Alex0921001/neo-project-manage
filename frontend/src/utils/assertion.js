// 数据断言（kind=assertion）四元组工具：instruction JSON 解析 + 摘要 + 录入序列化
// 口径与后端 domain（verifications.js 断言引擎）保持一致：{target:"表名:id", field, op, value}

// 录入下拉操作符集合（第一版，与后端 ASSERTION_OPS 同口径）
export const ASSERTION_OP_OPTIONS = [
  { value: "not_null", label: "非空" },
  { value: "null", label: "为空" },
  { value: "eq", label: "等于" },
  { value: "neq", label: "不等于" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "包含" },
];

const OP_LABELS = Object.fromEntries(ASSERTION_OP_OPTIONS.map((o) => [o.value, o.label]));

/** not_null / null 不需要期望值输入 */
export function opNeedsValue(op) {
  return op !== "not_null" && op !== "null";
}

/** 解析断言四元组 instruction；缺四元组要素或非 JSON 返回 null（前端仅展示口径，不做执行语义校验） */
export function parseAssertion(instruction) {
  if (!instruction) return null;
  try {
    const a = JSON.parse(instruction);
    if (a && typeof a === "object" && !Array.isArray(a) && a.target && a.field && a.op) return a;
  } catch { /* 非 JSON 按无效处理 */ }
  return null;
}

/** 断言摘要：如 "quote_anchor · 非空"；无效定义返回 null（展示层兜底「无效断言定义」） */
export function assertionSummary(instruction) {
  const a = parseAssertion(instruction);
  if (!a) return null;
  return `${a.field} · ${OP_LABELS[a.op] || a.op}`;
}

/** 录入值序列化：空串/非 JSON 字面量按字符串，可解析的按原类型（数字/布尔/null/对象） */
function coerceValue(raw) {
  const t = String(raw ?? "").trim();
  if (t === "") return null;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/**
 * 录入四元组 → instruction JSON 字符串（存入 verification_items.instruction，后端断言引擎执行）
 * @param {{target: string, field: string, op: string, value: string}} form
 */
export function buildAssertionInstruction({ target, field, op, value }) {
  return JSON.stringify({
    target: String(target || "").trim(),
    field: String(field || "").trim(),
    op,
    value: coerceValue(value),
  });
}
