import { createDataAccess } from "../lib/data.js";

export const name = "update_requirement_status";
export const description = "需求状态流转：待处理 → 已完成 / 已取消（已完成或已取消的状态不可再变更）";
export const parameters = {
  type: "object",
  required: ["projectId", "requirementId", "status"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    requirementId: { type: "string", description: "需求 ID" },
    status: { type: "string", enum: ["待处理", "已完成", "已取消"], description: "目标状态" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const req = data.updateRequirementStatus(input.projectId, input.requirementId, input.status);
  return { content: [{ type: "text", text: `✅ 需求「${req.name}」状态已更新为「${req.status}」[${req.id}]` }] };
}
