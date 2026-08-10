import { createDataAccess } from "../lib/data.js";

export const name = "update_annotation";
export const description = "编辑便利贴（批注）内容、类型或确认状态";
export const parameters = {
  type: "object",
  required: ["taskId", "annotationId"],
  properties: {
    taskId: { type: "string", description: "便利贴所属任务 ID" },
    annotationId: { type: "string", description: "便利贴 ID" },
    content: { type: "string", description: "新内容（不传则不改）" },
    kind: {
      type: "string",
      enum: ["note", "decision", "risk", "milestone"],
      description: "便利贴类型：note=备注（默认）/ decision=决策 / risk=风险 / milestone=节点（不传则不改）",
    },
    confirmed: { type: "boolean", description: "是否标记为已确认（不传则不改）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (input.content === undefined && input.confirmed === undefined && input.kind === undefined) {
    throw new Error("至少提供 content / kind / confirmed 之一");
  }
  const ann = data.updateAnnotation(input.taskId, input.annotationId, {
    content: input.content,
    kind: input.kind,
    confirmed: input.confirmed,
  });
  return {
    content: [{
      type: "text",
      text: `已更新便利贴「${ann.content}」[ID: ${ann.id}]${ann.confirmed ? "（已确认）" : ""}`,
    }],
  };
}
