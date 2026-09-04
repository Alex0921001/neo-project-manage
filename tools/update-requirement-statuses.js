import { createDataAccess } from "../lib/data.js";

export const name = "update_requirement_statuses";
export const description = "批量流转需求状态（待处理/已完成/已取消，任何状态间可互转）。逐条独立校验：单条失败不影响其他条，返回成功/失败清单及原因，不做整体回滚。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "需求状态列表（最多 50 个）",
      items: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string", description: "需求 ID" },
          status: { type: "string", enum: ["待处理", "已完成", "已取消"], description: "目标状态" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多更新 50 个需求状态");
  const res = data.updateRequirementStatuses(input.projectId, input.items.map((it) => ({
    id: it.id,
    status: it.status,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push("成功：");
    for (const s of res.success) lines.push(`  - ${s.name} → ${s.status} [ID: ${s.id}]`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
