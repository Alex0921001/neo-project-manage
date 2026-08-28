import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_update";
export const description = "更新临时任务：编辑内容 / 标记完成（action=complete）/ 退回未完成（action=reopen）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "临时任务 ID" },
    content: { type: "string", description: "新内容（可选，传入则编辑）" },
    action: {
      type: "string",
      enum: ["complete", "reopen"],
      description: "动作（可选）：complete=标记完成，reopen=退回未完成（仅已完成未转化的可退回）",
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.updateQuickTask(input.id, { content: input.content, action: input.action });
  const statusLabel = { active: "未完成", done: "已完成", converted: "已转化", archived: "已归档" };
  return { content: [{ type: "text", text: `已更新临时任务 [ID: ${task.id}]（${statusLabel[task.status]}）${task.content}` }] };
}
