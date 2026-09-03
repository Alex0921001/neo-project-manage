import { createDataAccess } from "../lib/data.js";

export const name = "list_verification_categories";
export const description = "查询项目验证分类字典（分组管理），验证项按 category 归组";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.listVerificationCategories(input.projectId);
  const lines = result.items.map((c) => `- ${c.name}`);
  return { content: [{ type: "text", text: `共 ${result.total} 个分类：\n${lines.join("\n") || "（空）"}` }] };
}
