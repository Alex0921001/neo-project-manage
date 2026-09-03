import { createDataAccess } from "../lib/data.js";

export const name = "update_verification_item";
export const description = "编辑验证项（内容/分类/备注），全量审计";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "验证项 ID" },
    content: { type: "string", description: "新的验证内容（可选）" },
    note: { type: "string", description: "备注（可选，传空串清除）" },
    category: { type: "string", description: "分类（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { projectId, id, ...patch } = input;
  const item = data.updateVerificationItem(projectId, id, patch);
  return { content: [{ type: "text", text: `已更新验证项 [ID: ${item.id}]` }] };
}
