// 2026-07-30 鹏哥要求：改 / 删操作只能在插件中手动调整，本工具不再暴露给 Agent。需要时取消注释即可恢复。
/*
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
*/
