import { createDataAccess } from "../lib/data.js";

export const name = "link_requirement_plans";
export const description = "需求关联方案（多对多挂载，重复关联自动去重）";
export const parameters = {
  type: "object",
  required: ["projectId", "requirementId", "planIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    requirementId: { type: "string", description: "需求 ID" },
    planIds: { type: "array", items: { type: "string" }, description: "要关联的方案 ID 列表" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { linked } = data.linkRequirementPlans(input.projectId, input.requirementId, input.planIds);
  return { content: [{ type: "text", text: `✅ 已关联 ${linked} 个方案到需求 [${input.requirementId}]` }] };
}
