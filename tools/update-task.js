import { createDataAccess } from "../lib/data.js";

export const name = "update_task";
export const description = "编辑任务（改名、改描述、标记完成/未完成）";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "任务 ID" },
    name: { type: "string", description: "任务名称" },
    description: { type: "string", description: "简述" },
    done: { type: "boolean", description: "是否已完成" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.updateTask(input.projectId, input.id, {
    name: input.name,
    description: input.description,
    done: input.done,
  });
  return {
    content: [{
      type: "text",
      text: `已更新任务 #${task.index_num + 1}「${task.name}」${task.done ? "☑ 已完成" : "☐ 未完成"} [ID: ${task.id}]`,
    }],
  };
}
