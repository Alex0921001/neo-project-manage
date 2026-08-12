import { createDataAccess } from "../lib/data.js";

export const name = "create_task";
export const description = "在项目下创建任务（可选：成员、起止日期、父任务）";
export const parameters = {
  type: "object",
  required: ["projectId", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "任务名称" },
    description: { type: "string", description: "简述" },
    parentTaskId: { type: "string", description: "父任务 ID（不填则为顶层任务）" },
    assignees: { type: "array", items: { type: "string" }, description: "任务成员列表（每个必须在项目 members 中，非必填）" },
    startDate: { type: "string", description: "任务开始日期 YYYY-MM-DD（非必填）" },
    endDate: { type: "string", description: "任务结束日期 YYYY-MM-DD，需 >= startDate（非必填）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.createTask(input.projectId, {
    name: input.name,
    description: input.description,
    parentTaskId: input.parentTaskId,
    assignees: input.assignees,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const dateText = [task.startDate, task.endDate].filter(Boolean).join(" ~ ");
  const parts = [
    `已创建任务 #${task.index_num + 1}「${task.name}」[ID: ${task.id}]`,
  ];
  if (task.parentTaskId) parts.push(`父任务: ${task.parentTaskId}`);
  if (task.assignees?.length) parts.push(`成员: ${task.assignees.join("、")}`);
  if (dateText) parts.push(`日期: ${dateText}`);
  if (task.warnings?.length) parts.push(`⚠ ${task.warnings.join("；")}`);
  return { content: [{ type: "text", text: parts.join("；") }] };
}
