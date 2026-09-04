import { createDataAccess } from "../lib/data.js";

export const name = "create_verifications";
export const description = "批量创建验证卡（最多 50 个，事务包裹：任一条校验失败整体回滚）。每项含 name（必填）、taskIds（关联任务，可选多选）、planIds（关联方案，可选）、note。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "验证卡列表（最多 50 个）",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "验证名称" },
          taskIds: { type: "array", items: { type: "string" }, description: "关联任务 ID 数组（可选，多选）" },
          planIds: { type: "array", items: { type: "string" }, description: "关联方案 ID 数组（可选）" },
          note: { type: "string", description: "备注（可选）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多创建 50 个验证卡");
  const created = data.createVerifications(input.projectId, input.items.map((it) => ({
    name: it.name,
    taskIds: it.taskIds,
    planIds: it.planIds,
    note: it.note,
  })));
  const lines = [`✅ 已批量创建 ${created.length} 个验证卡：`];
  for (const v of created) lines.push(`  - ${v.name} [ID: ${v.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
