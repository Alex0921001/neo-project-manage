import { createDataAccess } from "../lib/data.js";

export const name = "get_requirement";
export const description = "获取需求详情（含关联方案明细：id/标题/状态）";
export const parameters = {
  type: "object",
  required: ["projectId", "requirementId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    requirementId: { type: "string", description: "需求 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const r = data.getRequirement(input.projectId, input.requirementId);
  const lines = [
    `${r.status === "已完成" ? "✅" : r.status === "已取消" ? "⛔" : "⬜"} ${r.name}（${r.status}）[${r.priority}] [${r.id}]`,
    r.description ? `描述: ${r.description.replace(/<[^>]*>/g, "").slice(0, 200)}` : "描述: (空)",
    `关联方案 (${r.plans.length}):`,
    ...(r.plans.length ? r.plans.map((p) => `  - ${p.title}（${p.status}）[${p.id}]`) : ["  (无)"]),
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
