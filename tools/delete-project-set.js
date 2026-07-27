import { createDataAccess } from "../lib/data.js";

export const name = "delete_project_set";
export const description = "删除项目集（集下还有项目时无法删除）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "项目集 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteProjectSet(input.id);
  return { content: [{ type: "text", text: "已删除项目集" }] };
}
