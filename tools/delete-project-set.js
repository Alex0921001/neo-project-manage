// 2026-07-30 鹏哥要求：改 / 删操作只能在插件中手动调整，本工具不再暴露给 Agent。需要时取消注释即可恢复。
/*
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
*/
