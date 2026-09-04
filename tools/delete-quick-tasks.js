import { createDataAccess } from "../lib/data.js";

export const name = "delete_quick_tasks";
export const description = "批量删除临时任务（未完成/已完成/已转化均可直删；已归档任务请走 delete_quick_task_archive）。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["ids"],
  properties: {
    ids: {
      type: "array",
      description: "要删除的临时任务 ID 列表（最多 50 个）",
      items: { type: "string", description: "临时任务 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("ids 不能为空");
  if (input.ids.length > 50) throw new Error("单次最多删除 50 个临时任务");
  const res = data.deleteQuickTasks(input.ids);
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push(`已删除：${res.success.map((s) => s.id).join("、")}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
