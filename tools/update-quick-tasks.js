import { createDataAccess } from "../lib/data.js";

export const name = "update_quick_tasks";
export const description = "批量更新临时任务（每项含 id + 可改字段 content/action）。action：complete=标记完成（仅未完成可标记）、reopen=退回未完成（仅已完成可退回，已转化不可退）。逐条独立校验：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      description: "临时任务列表（最多 50 个），每项含 id（必填）+ 可改字段",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "临时任务 ID" },
          content: { type: "string", description: "新内容（可选，传入则编辑）" },
          action: { type: "string", enum: ["complete", "reopen"], description: "动作（可选）：complete=标记完成，reopen=退回未完成" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多更新 50 个临时任务");
  const res = data.updateQuickTasks(input.items.map((it) => ({
    id: it.id,
    content: it.content,
    action: it.action,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push("成功：");
    for (const s of res.success) lines.push(`  - [${s.status}] ${s.content} [ID: ${s.id}]`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
