import { createDataAccess } from "../lib/data.js";

export const name = "delete_comment";
export const description = "删除统一评论（需求/方案评论通用，删除留审计）";
export const parameters = {
  type: "object",
  required: ["projectId", "commentId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    commentId: { type: "string", description: "评论 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteComment(input.projectId, input.commentId);
  return { content: [{ type: "text", text: "已删除评论" }] };
}
