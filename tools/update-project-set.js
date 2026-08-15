import { createDataAccess } from "../lib/data.js";

export const name = "update_project_set";
export const description = "编辑项目集名称（重命名项目集，ID 不变）";
export const parameters = {
  type: "object",
  required: ["id", "name"],
  properties: {
    id: { type: "string", description: "项目集 ID" },
    name: { type: "string", description: "新的项目集名称" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const set = data.updateProjectSet(input.id, { name: input.name });
  if (!set) throw new Error(`项目集 ${input.id} 不存在`);
  return { content: [{ type: "text", text: `已更新项目集「${set.name}」[ID: ${set.id}]` }] };
}
