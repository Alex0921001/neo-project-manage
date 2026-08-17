import { createDataAccess } from "../lib/data.js";

export const name = "create_project_set";
export const description = "创建项目集（分组容器，用于归拢项目）；返回新建项目集 ID";
export const parameters = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", description: "项目集名称" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const set = data.createProjectSet({ name: input.name });
  return { content: [{ type: "text", text: `已创建项目集「${set.name}」ID: ${set.id}` }] };
}
