import { createDataAccess } from "../lib/data.js";

export const name = "delete_plans";
export const description = "批量删除方案（仅草稿/已废弃状态可删除，限制逐条生效；删除会级联清除评论与关联）。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "planIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    planIds: {
      type: "array",
      description: "要删除的方案 ID 列表（最多 50 个）",
      items: { type: "string", description: "方案 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.planIds) || input.planIds.length === 0) throw new Error("planIds 不能为空");
  if (input.planIds.length > 50) throw new Error("单次最多删除 50 个方案");
  const res = data.deletePlans(input.projectId, input.planIds);
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push(`已删除：${res.success.map((s) => s.id).join("、")}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
