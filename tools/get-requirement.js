import { createDataAccess } from "../lib/data.js";

export const name = "get_requirement";
export const description = "获取需求详情（含关联方案明细：id/标题/状态）；支持仅凭需求 ID 或唯一短前缀全局查询，projectId 可不传（传了则校验归属）";
export const parameters = {
  type: "object",
  required: ["requirementId"],
  properties: {
    projectId: { type: "string", description: "项目 ID（可选；不传则全局查询，传了则校验归属）" },
    requirementId: { type: "string", description: "需求 ID（完整 ID 或唯一短前缀）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const r = data.getRequirement(input.projectId || null, input.requirementId);
  const lines = [
    `${r.status === "已完成" ? "✅" : r.status === "已取消" ? "⛔" : "⬜"} ${r.name}（${r.status}）[${r.priority}] [ID: ${r.id}]`,
    `所属项目: ${r.projectName || "-"} [ID: ${r.projectId}]`,
    r.description ? `描述: ${r.description.replace(/<[^>]*>/g, "")}` : "描述: (空)",
    `关联方案 (${r.plans.length}):`,
    ...(r.plans.length ? r.plans.map((p) => `  - ${p.title}（${p.status}）[${p.id}]`) : ["  (无)"]),
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
