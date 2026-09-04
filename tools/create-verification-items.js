import { createDataAccess } from "../lib/data.js";

export const name = "create_verification_items";
export const description = "单张验证卡内批量创建验证项（最多 50 个，事务包裹：任一条校验失败整体回滚）。适用于建卡后一次导入整份检查清单。";
export const parameters = {
  type: "object",
  required: ["projectId", "verificationId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    verificationId: { type: "string", description: "验证卡 ID（支持短前缀）" },
    items: {
      type: "array",
      description: "验证项列表（最多 50 个）",
      items: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "string", description: "验证项内容（一句话检查项）" },
          category: { type: "string", description: "分类（可选，如 功能验证 / 边界与异常 / 回归验证）" },
          note: { type: "string", description: "备注（可选）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多创建 50 个验证项");
  const created = data.createVerificationItems(input.projectId, input.verificationId, input.items.map((it) => ({
    content: it.content,
    category: it.category,
    note: it.note,
  })));
  const lines = [`✅ 已批量创建 ${created.length} 个验证项：`];
  for (const v of created) lines.push(`  - ${v.content} [ID: ${v.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
