import { createDataAccess } from "../lib/data.js";

export const name = "clear_verification_group";
export const description = "批量清空某验证卡内指定分组的全部验证项（category 传空串 = 清空「通用」组）";
export const parameters = {
  type: "object",
  required: ["projectId", "verificationId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    verificationId: { type: "string", description: "验证卡 ID" },
    category: { type: "string", description: "分组名称（传空串清空「通用」组）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.clearVerificationItems(input.projectId, input.verificationId, input.category || "");
  return { content: [{ type: "text", text: `已清空 ${result.deleted} 条验证项` }] };
}
