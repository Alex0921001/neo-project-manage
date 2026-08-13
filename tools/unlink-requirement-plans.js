import { createDataAccess } from "../lib/data.js";

export const name = "unlink_requirement_plans";
export const description = "解除需求与方案的关联";
export const parameters = {
  type: "object",
  required: ["projectId", "requirementId", "planIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    requirementId: { type: "string", description: "需求 ID" },
    planIds: { type: "array", items: { type: "string" }, description: "要解除关联的方案 ID 列表" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { unlinked } = data.unlinkRequirementPlans(input.projectId, input.requirementId, input.planIds);
  return { content: [{ type: "text", text: `✅ 已解除 ${unlinked} 个方案的关联 [${input.requirementId}]` }] };
}
