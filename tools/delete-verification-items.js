import { createDataAccess } from "../lib/data.js";

export const name = "delete_verification_items";
export const description = "批量删除验证项（删除留内容快照审计）。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "ids"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    ids: {
      type: "array",
      description: "要删除的验证项 ID 列表（最多 50 个）",
      items: { type: "string", description: "验证项 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("ids 不能为空");
  if (input.ids.length > 50) throw new Error("单次最多删除 50 个验证项");
  const res = data.deleteVerificationItems(input.projectId, input.ids);
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
