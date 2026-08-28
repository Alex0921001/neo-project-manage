import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_add";
export const description = "新增一条临时任务（随手记，一行文字即可，不关联项目）";
export const parameters = {
  type: "object",
  required: ["content"],
  properties: {
    content: { type: "string", description: "临时任务内容（必填，不能为空）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.createQuickTask({ content: input.content });
  return { content: [{ type: "text", text: `已记录临时任务 [ID: ${task.id}] ${task.content}` }] };
}
