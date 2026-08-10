import { createDataAccess } from "../lib/data.js";

export const name = "list_annotations";
export const description = "列出任务下的便利贴（批注），可按类型筛选";
export const parameters = {
  type: "object",
  required: ["taskId"],
  properties: {
    taskId: { type: "string", description: "任务 ID" },
    kind: {
      type: "string",
      enum: ["note", "decision", "risk", "milestone"],
      description: "按类型筛选：note=备注 / decision=决策 / risk=风险 / milestone=节点（不传=全部）",
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const list = data.getTaskAnnotations(input.taskId, input.kind);
  if (list.length === 0) {
    return { content: [{ type: "text", text: "该任务暂无便利贴" }] };
  }
  const lines = list.map((a) => {
    // 内容可能含换行，归一化为单行（对齐 list_tasks）
    const content = a.content.replace(/\s*\n+\s*/g, " ").trim();
    const confirmText = a.confirmed ? ` | 确认: ${a.confirmedAt || "-"}` : "";
    return `${kindIcon(a.kind)} ${content} [ID: ${a.id}] [类型: ${a.kind}] [创建: ${a.createdAt}${confirmText}]`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// 类型图标（展示用）
function kindIcon(kind) {
  return { note: "📝", decision: "📌", risk: "⚠️", milestone: "🏁" }[kind] || "📝";
}
