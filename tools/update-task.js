import { createDataAccess } from "../lib/data.js";

export const name = "update_task";
export const description = "编辑任务（改名、改描述、改成员、改起止日期、标记完成/未完成）";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "任务 ID" },
    name: { type: "string", description: "任务名称" },
    description: { type: "string", description: "简述" },
    done: { type: "boolean", description: "是否已完成" },
    assignees: { type: "array", items: { type: "string" }, description: "任务成员列表（每个必须在项目 members 中，传空数组清空）" },
    startDate: { type: "string", description: "任务开始日期 YYYY-MM-DD（传空字符串清空）" },
    endDate: { type: "string", description: "任务结束日期 YYYY-MM-DD，需 >= startDate（传空字符串清空）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.updateTask(input.projectId, input.id, {
    name: input.name,
    description: input.description,
    done: input.done,
    assignees: input.assignees,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const dateText = [task.startDate, task.endDate].filter(Boolean).join(" ~ ");
  const parts = [
    `已更新任务 #${task.index_num + 1}「${task.name}」${task.done ? "☑ 已完成" : "☐ 未完成"} [ID: ${task.id}]`,
  ];
  if (task.assignees?.length) parts.push(`成员: ${task.assignees.join("、")}`);
  if (dateText) parts.push(`日期: ${dateText}`);
  if (task.warnings?.length) parts.push(`⚠ ${task.warnings.join("；")}`);
  return { content: [{ type: "text", text: parts.join("；") }] };
}
