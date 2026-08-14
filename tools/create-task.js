import { createDataAccess } from "../lib/data.js";

export const name = "create_task";
export const description = "在项目下创建任务（可选：成员、起止日期、优先级、父任务）";
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
    priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"], description: "任务优先级（默认 P3，P0 最急 → P5 最缓，非必填）" },
  },
};

export async function execute(input, toolCtx) {
  // 未知参数拦截：防 AI 传 schema 外参数被静默忽略（如 done 不生效）
  const allowed = Object.keys(parameters.properties);
  const unknown = Object.keys(input || {}).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new Error(`未知参数: ${unknown.join(", ")}。支持参数: ${allowed.join(", ")}`);
  }
  const data = createDataAccess(toolCtx.dataDir);
  const task = data.createTask(input.projectId, {
    name: input.name,
    description: input.description,
    parentTaskId: input.parentTaskId,
    assignees: input.assignees,
    startDate: input.startDate,
    endDate: input.endDate,
    priority: input.priority,
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
