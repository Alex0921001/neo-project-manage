import { createDataAccess } from "../lib/data.js";

export const name = "rename_verification_category";
export const description = "重命名验证分类（自动同步该分类下所有验证项的 category）";
export const parameters = {
  type: "object",
  required: ["projectId", "id", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "分类 ID" },
    name: { type: "string", description: "新分类名称（≤20 字，同项目内不可重名）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const cat = data.renameVerificationCategory(input.projectId, input.id, input.name);
  return { content: [{ type: "text", text: `已重命名为「${cat.name}」，该分类下验证项已同步更新` }] };
}
