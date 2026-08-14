import { createDataAccess } from "../lib/data.js";

export const name = "delete_requirement";
export const description = "删除需求（级联清除其与方案的关联；注意：已完成的需求禁止删除）";
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
  data.deleteRequirement(input.projectId, input.requirementId);
  return { content: [{ type: "text", text: `✅ 已删除需求 [${input.requirementId}]` }] };
}
