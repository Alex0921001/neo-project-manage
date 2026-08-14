import { createDataAccess } from "../lib/data.js";

export const name = "update_requirement_status";
export const description = "需求状态流转（三态自由切换：待处理 / 已完成 / 已取消，任何状态间可互转；已完成/已取消后名称、简述、优先级、关联方案不可再编辑）";
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
