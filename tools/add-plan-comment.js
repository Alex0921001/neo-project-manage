import { createDataAccess } from "../lib/data.js";

export const name = "add_plan_comment";
export const description = "给方案添加评论（纯文本，任何状态均可评论）";
export const parameters = {
  type: "object",
  required: ["projectId", "planId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    planId: { type: "string", description: "方案 ID" },
    content: { type: "string", description: "评论内容" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const comment = data.addPlanComment(input.projectId, input.planId, input.content);
  return { content: [{ type: "text", text: `已添加评论 [ID: ${comment.id}]` }] };
}
