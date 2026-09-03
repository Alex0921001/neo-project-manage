import { createDataAccess } from "../lib/data.js";

export const name = "add_verification_item";
export const description = "给验证卡新增验证项（一句话检查项，可带分类与备注）";
export const parameters = {
  type: "object",
  required: ["projectId", "verificationId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    verificationId: { type: "string", description: "验证卡 ID" },
    content: { type: "string", description: "验证项内容（一句话检查项）" },
    category: { type: "string", description: "分类（可选，如 功能验证 / 边界与异常 / 回归验证）" },
    note: { type: "string", description: "备注（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { projectId, verificationId, ...rest } = input;
  const item = data.createVerificationItem(projectId, verificationId, rest);
  return { content: [{ type: "text", text: `已添加验证项 [ID: ${item.id}]` }] };
}
