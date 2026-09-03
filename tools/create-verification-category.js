import { createDataAccess } from "../lib/data.js";

export const name = "create_verification_category";
export const description = "新建验证分类（分组管理字典项，名称 ≤20 字，同项目内不可重名）";
export const parameters = {
  type: "object",
  required: ["projectId", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "分类名称（≤20 字）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const cat = data.createVerificationCategory(input.projectId, input.name);
  return { content: [{ type: "text", text: `已创建验证分类「${cat.name}」 [ID: ${cat.id}]` }] };
}
