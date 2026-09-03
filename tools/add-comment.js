import { createDataAccess } from "../lib/data.js";

export const name = "add_comment";
export const description = "添加统一评论（方案/需求均可，支持划词引用 quoteText）；任何状态均可评论";
export const parameters = {
  type: "object",
  required: ["projectId", "targetType", "targetId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    targetType: { type: "string", description: "评论对象类型（plan / requirement）", enum: ["plan", "requirement"] },
    targetId: { type: "string", description: "评论对象 ID" },
    content: { type: "string", description: "评论内容（纯文本）" },
    quoteText: { type: "string", description: "引用的文字片段（可选，如划词引用的原文）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const comment = data.addComment(
    input.projectId, input.targetType, input.targetId, input.content,
    input.quoteText || null
  );
  return { content: [{ type: "text", text: `已添加评论 [ID: ${comment.id}]` }] };
}
