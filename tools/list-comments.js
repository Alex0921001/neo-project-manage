import { createDataAccess } from "../lib/data.js";

export const name = "list_comments";
export const description = "查询统一评论列表（需求/方案共用评论表）：可按对象（targetType+targetId）查，或项目级全览";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    targetType: { type: "string", description: "评论对象类型（可选，plan / requirement）" },
    targetId: { type: "string", description: "评论对象 ID（与 targetType 搭配使用；不传返回项目级全部评论）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  let comments;
  if (input.targetId && input.targetType) {
    comments = data.getComments(input.projectId, input.targetType, input.targetId);
  } else {
    comments = data.listAllComments(input.projectId, input.targetType || undefined);
  }
  const typeLabel = { plan: "方案", requirement: "需求" };
  const lines = comments.map((c) => {
    const at = `${typeLabel[c.targetType] || c.targetType} [${c.targetId}]`;
    const quote = c.quoteText ? `（引用：${c.quoteText.slice(0, 30)}…）` : "";
    const edited = c.edited ? "（已编辑）" : "";
    return `- [${c.id}] ${at} ${c.content}${quote}${edited}`;
  });
  return { content: [{ type: "text", text: `共 ${comments.length} 条评论：\n${lines.join("\n") || "（空）"}` }] };
}
