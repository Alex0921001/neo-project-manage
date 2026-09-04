import { createDataAccess } from "../lib/data.js";

export const name = "update_requirements";
export const description = "批量编辑需求（每项含 id + 可改字段 name/description/priority/planIds；仅待处理状态的需求可修改）。逐条独立校验：单条失败不影响其他条，返回成功/失败清单及原因，不做整体回滚。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "需求列表（最多 50 个），每项含 id（必填）+ 可改字段",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "需求 ID" },
          name: { type: "string", description: "需求名称（最多 50 字）" },
          description: { type: "string", description: "需求简述（富文本 HTML）" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"], description: "优先级" },
          planIds: { type: "array", items: { type: "string" }, description: "关联方案 ID 列表（传则整体替换）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多更新 50 个需求");
  const res = data.updateRequirements(input.projectId, input.items.map((it) => ({
    id: it.id,
    name: it.name,
    description: it.description,
    priority: it.priority,
    planIds: it.planIds,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push("成功：");
    for (const s of res.success) lines.push(`  - ${s.name} [ID: ${s.id}]`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
