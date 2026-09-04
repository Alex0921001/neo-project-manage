import { createDataAccess } from "../lib/data.js";

export const name = "update_comments";
export const description = "批量编辑评论内容（每项含 id + content）。更新后保留「已编辑」标记，全量审计。逐条独立校验：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "评论列表（最多 50 条）",
      items: {
        type: "object",
        required: ["id", "content"],
        properties: {
          id: { type: "string", description: "评论 ID" },
          content: { type: "string", description: "新评论内容（纯文本）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多编辑 50 条评论");
  const res = data.updateComments(input.projectId, input.items.map((it) => ({
    id: it.id,
    content: it.content,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push(`已更新：${res.success.map((s) => s.id).join("、")}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
