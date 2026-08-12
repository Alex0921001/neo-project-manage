import { createDataAccess } from "../lib/data.js";

export const name = "list_annotations";
export const description = "列出便利贴（批注）：按任务 ID 查单任务，或按项目 ID 查项目级全部（带任务名，可按类型/关键词筛选）";
export const parameters = {
  type: "object",
  properties: {
    taskId: { type: "string", description: "任务 ID（与 projectId 二选一）" },
    projectId: { type: "string", description: "项目 ID（与 taskId 二选一，查项目下全部任务的批注）" },
    kind: {
      type: "string",
      enum: ["note", "decision", "risk", "milestone"],
      description: "按类型筛选：note=备注 / decision=决策 / risk=风险 / milestone=节点（不传=全部）",
    },
    keyword: { type: "string", description: "按内容关键词模糊搜索（可选，仅项目级模式生效）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { taskId, projectId, kind, keyword } = input;

  // 二选一校验
  if (taskId && projectId) throw new Error("taskId 与 projectId 只能传一个");
  if (!taskId && !projectId) throw new Error("taskId 与 projectId 至少传一个");

  let list;
  if (projectId) {
    list = data.getProjectAnnotations(projectId, { kind, keyword });
  } else {
    list = data.getTaskAnnotations(taskId, kind);
  }

  if (list.length === 0) {
    return { content: [{ type: "text", text: "暂无便利贴" }] };
  }

  const lines = list.map((a) => {
    // 内容可能含换行，归一化为单行（对齐 list_tasks）
    const content = a.content.replace(/\s*\n+\s*/g, " ").trim();
    const confirmText = a.confirmed ? ` | 确认: ${a.confirmedAt || "-"}` : "";
    const taskPart = a.taskName ? ` @${a.taskName}` : "";
    return `${kindIcon(a.kind)} ${content}${taskPart} [ID: ${a.id}] [类型: ${a.kind}] [创建: ${a.createdAt}${confirmText}]`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// 类型图标（展示用）
function kindIcon(kind) {
  return { note: "📌", decision: "🧭", risk: "⚠️", milestone: "🎯" }[kind] || "📌";
}
