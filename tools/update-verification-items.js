import { createDataAccess } from "../lib/data.js";

export const name = "update_verification_items";
export const description = "批量编辑验证项（每项含 id + 可改字段 content/category/note），全量审计。逐条独立校验：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "验证项列表（最多 50 个）",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "验证项 ID" },
          content: { type: "string", description: "新的验证内容" },
          category: { type: "string", description: "分类（可选）" },
          note: { type: "string", description: "备注（可选，传空串清除）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多编辑 50 个验证项");
  const res = data.updateVerificationItems(input.projectId, input.items.map((it) => ({
    id: it.id,
    content: it.content,
    category: it.category,
    note: it.note,
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
