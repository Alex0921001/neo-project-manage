import { createDataAccess } from "../lib/data.js";

export const name = "delete_comments";
export const description = "批量删除评论（需求/方案评论通用，删除留审计；带划词引用的评论删除后由前端流程清理正文标注）。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "commentIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    commentIds: {
      type: "array",
      description: "要删除的评论 ID 列表（最多 50 个）",
      items: { type: "string", description: "评论 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.commentIds) || input.commentIds.length === 0) throw new Error("commentIds 不能为空");
  if (input.commentIds.length > 50) throw new Error("单次最多删除 50 条评论");
  const res = data.deleteComments(input.projectId, input.commentIds);
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push(`已删除：${res.success.map((s) => s.id).join("、")}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
