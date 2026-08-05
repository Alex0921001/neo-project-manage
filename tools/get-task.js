import { createDataAccess } from "../lib/data.js";

export const name = "get_task";
export const description = "按任务 ID 全局查询任务详情（含所属项目、父任务、批注、子任务，无需 projectId）";
export const parameters = {
  type: "object",
  required: ["taskId"],
  properties: {
    taskId: { type: "string", description: "任务 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.getTaskById(input.taskId);
  if (!task) throw new Error(`任务 ${input.taskId} 不存在`);

  const lines = [
    `${task.done ? "✅" : "⬜"} ${task.name} [ID: ${task.id}]`,
    task.description ? `描述: ${task.description}` : "描述: -",
    `状态: ${task.done ? "已完成" : "未完成"}`,
    `所属项目: ${task.project ? `${task.project.name} [ID: ${task.project.id}]` : "-"}`,
    task.parentTask ? `父任务: ${task.parentTask.name} [ID: ${task.parentTask.id}]` : null,
    `创建时间: ${task.created_at}`,
    `序号: ${task.index_num != null ? task.index_num + 1 : "-"}`,
  ].filter(Boolean);

  if (task.subtasks?.length) {
    lines.push(`--- 子任务 (${task.subtasks.length}) ---`);
    for (const s of task.subtasks) {
      lines.push(`  ${s.done ? "☑" : "☐"} ${s.name} [ID: ${s.id}]`);
    }
  }
  if (task.annotations?.length) {
    lines.push(`--- 批注 (${task.annotations.length}) ---`);
    for (const a of task.annotations) {
      lines.push(`  ${a.confirmed ? "✅" : "🟡"} ${a.content} [ID: ${a.id}]`);
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
