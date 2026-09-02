import { createDataAccess } from "../lib/data.js";

export const name = "update_plan_comment";
export const description = "编辑方案评论内容（更新后保留「已编辑」标记，全量审计）";
export const parameters = {
  type: "object",
  required: ["projectId", "commentId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    commentId: { type: "string", description: "评论 ID（get_plan 返回的评论列表中）" },
    content: { type: "string", description: "新的评论内容" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const comment = data.updateComment(input.projectId, input.commentId, input.content);
  return { content: [{ type: "text", text: `已编辑评论 [ID: ${comment.id}]` }] };
}
