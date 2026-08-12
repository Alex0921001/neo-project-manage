import { createDataAccess } from "../lib/data.js";

export const name = "delete_plan_comment";
export const description = "删除方案评论";
export const parameters = {
  type: "object",
  required: ["projectId", "planId", "commentId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    planId: { type: "string", description: "方案 ID" },
    commentId: { type: "string", description: "评论 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deletePlanComment(input.projectId, input.planId, input.commentId);
  return { content: [{ type: "text", text: `已删除评论 ${input.commentId}` }] };
}
