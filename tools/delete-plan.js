import { createDataAccess } from "../lib/data.js";

export const name = "delete_plan";
export const description = "删除方案（仅草稿/已废弃状态可删；级联删除其评论；已转出的任务保留不受影响）";
export const parameters = {
  type: "object",
  required: ["projectId", "planId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    planId: { type: "string", description: "方案 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deletePlan(input.projectId, input.planId);
  return { content: [{ type: "text", text: `已删除方案 ${input.planId}` }] };
}
