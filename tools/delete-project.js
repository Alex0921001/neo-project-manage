import { createDataAccess } from "../lib/data.js";

export const name = "delete_project";
export const description = "删除项目（含已完成任务时无法删除；级联删除项目下全部任务；转化自该项目的临时任务自动回退为已完成）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteProject(input.id);
  return { content: [{ type: "text", text: "已删除项目" }] };
}
