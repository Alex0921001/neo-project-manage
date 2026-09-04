import { createDataAccess } from "../lib/data.js";

export const name = "create_requirements";
export const description = "批量创建需求（最多 50 个，事务包裹：任一条校验失败整体回滚）。每项含 name（必填）、description、priority（P0-P5）、planIds（关联方案）。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "需求列表（最多 50 个）",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "需求名称（最多 50 字）" },
          description: { type: "string", description: "需求简述（富文本 HTML）" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"], description: "优先级（默认 P3）" },
          planIds: { type: "array", items: { type: "string" }, description: "关联方案 ID 列表（可选）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多创建 50 个需求");
  const created = data.createRequirements(input.projectId, input.items.map((it) => ({
    name: it.name,
    description: it.description,
    priority: it.priority,
    planIds: it.planIds,
  })));
  const lines = [`✅ 已批量创建 ${created.length} 个需求：`];
  for (const r of created) lines.push(`  - ${r.name} [${r.priority}] [ID: ${r.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
