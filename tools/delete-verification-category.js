import { createDataAccess } from "../lib/data.js";

export const name = "delete_verification_category";
export const description = "删除验证分类（该分类下所有验证项自动归入「通用」组，不删除验证项本身）";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "分类 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteVerificationCategory(input.projectId, input.id);
  return { content: [{ type: "text", text: "已删除分类，该分类下验证项已归入「通用」组" }] };
}
