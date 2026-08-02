import { createDataAccess } from "../lib/data.js";

export const name = "create_task";
export const description = "在项目下创建任务";
export const parameters = {
  type: "object",
  required: ["projectId", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "任务名称" },
    description: { type: "string", description: "简述" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.createTask(input.projectId, { name: input.name, description: input.description });
  return { content: [{ type: "text", text: `已创建任务 #${task.index_num}「${task.name}」[ID: ${task.id}]` }] };
}
