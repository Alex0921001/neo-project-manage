import { createDataAccess } from "../lib/data.js";

export const name = "update_comment";
export const description = "编辑统一评论内容（需求/方案评论通用）";
export const parameters = {
  type: "object",
  required: ["projectId", "commentId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    commentId: { type: "string", description: "评论 ID" },
    content: { type: "string", description: "新评论内容（纯文本）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const comment = data.updateComment(input.projectId, input.commentId, input.content);
  return { content: [{ type: "text", text: `已更新评论 [ID: ${comment.id}]` }] };
}
