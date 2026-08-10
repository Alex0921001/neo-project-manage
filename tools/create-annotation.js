import { createDataAccess } from "../lib/data.js";

export const name = "create_annotation";
export const description = "给任务添加便利贴（批注）";
export const parameters = {
  type: "object",
  required: ["projectId", "taskId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    taskId: { type: "string", description: "任务 ID" },
    content: { type: "string", description: "便利贴内容" },
    kind: {
      type: "string",
      enum: ["note", "decision", "risk", "milestone"],
      description: "便利贴类型：note=备注（默认）/ decision=决策 / risk=风险 / milestone=节点",
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const ann = data.createAnnotation(input.projectId, input.taskId, {
    content: input.content,
    kind: input.kind,
  });
  return { content: [{ type: "text", text: `已添加${kindLabel(ann.kind)}「${ann.content}」[ID: ${ann.id}] [类型: ${ann.kind}]` }] };
}

// 中文类型标签（输出展示用）
function kindLabel(kind) {
  return { note: "便利贴", decision: "决策", risk: "风险", milestone: "节点" }[kind] || "便利贴";
}
