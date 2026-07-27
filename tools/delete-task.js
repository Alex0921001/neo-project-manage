import { createDataAccess } from "../lib/data.js";

export const name = "delete_task";
export const description = "删除任务";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "任务 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteTask(input.projectId, input.id);
  return { content: [{ type: "text", text: "已删除任务" }] };
}
