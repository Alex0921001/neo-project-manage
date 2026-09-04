import { createDataAccess } from "../lib/data.js";

export const name = "add_comments";
export const description = "同一目标（方案/需求）下批量添加评论（最多 50 条，事务包裹：任一条校验失败整体回滚）。每项含 content（必填）、quoteText/quoteAnchor（划词引用，可选）。任何状态均可评论。";
export const parameters = {
  type: "object",
  required: ["projectId", "targetType", "targetId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    targetType: { type: "string", enum: ["plan", "requirement"], description: "评论对象类型（方案 / 需求）" },
    targetId: { type: "string", description: "评论对象 ID（方案 ID 或需求 ID，支持短前缀）" },
    items: {
      type: "array",
      description: "评论列表（最多 50 条）",
      items: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "string", description: "评论内容（纯文本）" },
          quoteText: { type: "string", description: "引用的文字片段（可选，如划词引用的原文）" },
          quoteAnchor: { type: "string", description: "引用锚点（可选，前端划词定位信息）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多添加 50 条评论");
  const created = data.addComments(input.projectId, input.targetType, input.targetId, input.items.map((it) => ({
    content: it.content,
    quoteText: it.quoteText,
    quoteAnchor: it.quoteAnchor,
  })));
  const lines = [`✅ 已批量添加 ${created.length} 条评论：`];
  for (const c of created) lines.push(`  - ${c.content.slice(0, 50)} [ID: ${c.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
