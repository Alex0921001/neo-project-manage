import { createDataAccess } from "../lib/data.js";

export const name = "create_annotation";
export const description = "给任务添加便利贴（批注）";
export const parameters = {
  type: "object",
  required: ["taskId", "content"],
  properties: {
    taskId: { type: "string", description: "任务 ID" },
    content: { type: "string", description: "便利贴内容" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const ann = data.createAnnotation(input.taskId, { content: input.content });
  return { content: [{ type: "text", text: `已添加便利贴「${ann.content}」[ID: ${ann.id}]` }] };
}
