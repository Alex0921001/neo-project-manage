import { createDataAccess } from "../lib/data.js";

export const name = "update_tasks";
export const description = "批量更新任务（每项含 id + 可改字段 name/description/assignees/startDate/endDate/priority/done）。逐条独立校验：单条失败不影响其他条，返回成功/失败清单及原因，不做整体回滚。";
export const parameters = {
  type: "object",
  required: ["projectId", "tasks"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    tasks: {
      type: "array",
      description: "任务列表（最多 50 个），每项含 id（必填）+ 可改字段",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "任务 ID" },
          name: { type: "string", description: "任务名称" },
          description: { type: "string", description: "简述" },
          assignees: { type: "array", items: { type: "string" }, description: "任务成员列表（每个必须在项目 members 中，传空数组清空）" },
          startDate: { type: "string", description: "任务开始日期 YYYY-MM-DD（传空字符串清空）" },
          endDate: { type: "string", description: "任务结束日期 YYYY-MM-DD，需 >= startDate（传空字符串清空）" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"], description: "任务优先级" },
          done: { type: "boolean", description: "是否已完成" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error("tasks 不能为空");
  if (input.tasks.length > 50) throw new Error("单次最多更新 50 个任务");
  const res = data.updateTasks(input.projectId, input.tasks.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    assignees: t.assignees,
    startDate: t.startDate,
    endDate: t.endDate,
    priority: t.priority,
    done: t.done,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push("成功：");
    for (const s of res.success) lines.push(`  - ${s.name} [ID: ${s.id}]`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
