import { createDataAccess } from "../lib/data.js";

export const name = "delete_requirements";
export const description = "批量删除需求（已完成的需求不可删除，该限制逐条生效）。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "requirementIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    requirementIds: {
      type: "array",
      description: "要删除的需求 ID 列表（最多 50 个）",
      items: { type: "string", description: "需求 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.requirementIds) || input.requirementIds.length === 0) throw new Error("requirementIds 不能为空");
  if (input.requirementIds.length > 50) throw new Error("单次最多删除 50 个需求");
  const res = data.deleteRequirements(input.projectId, input.requirementIds);
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
