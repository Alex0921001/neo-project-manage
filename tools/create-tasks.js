import { createDataAccess } from "../lib/data.js";

export const name = "create_tasks";
export const description = "批量生成任务（一次创建多个任务，可指定父任务、成员、起止日期）";
export const parameters = {
  type: "object",
  required: ["projectId", "tasks"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    tasks: {
      type: "array",
      description: "任务列表（最多 50 个），每项含 name（必填）、description / parentTaskId / assignees / startDate / endDate / priority（可选）",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "任务名称" },
          description: { type: "string", description: "简述" },
          parentTaskId: { type: "string", description: "父任务 ID（不填则为顶层任务）" },
          assignees: { type: "array", items: { type: "string" }, description: "任务成员列表（每个必须在项目 members 中，非必填）" },
          startDate: { type: "string", description: "任务开始日期 YYYY-MM-DD（非必填）" },
          endDate: { type: "string", description: "任务结束日期 YYYY-MM-DD，需 >= startDate（非必填）" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"], description: "任务优先级（默认 P3，P0 最急 → P5 最缓，非必填）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error("tasks 不能为空");
  if (input.tasks.length > 50) throw new Error("单次最多创建 50 个任务");
  // 事务包裹批量创建（P2-3）：任一条失败整体回滚，不产生部分落库
  const created = data.createTasks(
    input.projectId,
    input.tasks.map((t) => ({
      name: t.name,
      description: t.description,
      parentTaskId: t.parentTaskId,
      assignees: t.assignees,
      startDate: t.startDate,
      endDate: t.endDate,
      priority: t.priority,
    }))
  );
  const lines = created.map((t) => {
    const extra = [];
    if (t.assignees?.length) extra.push(`成员: ${t.assignees.join("、")}`);
    const dateText = [t.startDate, t.endDate].filter(Boolean).join(" ~ ");
    if (dateText) extra.push(`日期: ${dateText}`);
    if (t.warnings?.length) extra.push(`⚠ ${t.warnings.join("；")}`);
    const extraText = extra.length ? `（${extra.join("，")}）` : "";
    return `- ${t.name} [ID: ${t.id}]${t.parent_task_id ? `（父任务: ${t.parent_task_id}）` : "（顶层）"}${extraText}`;
  });
  return { content: [{ type: "text", text: `已批量创建 ${created.length} 个任务：\n${lines.join("\n")}` }] };
}
