import { createDataAccess } from "../lib/data.js";

export const name = "delete_annotation";
export const description = "删除便利贴（批注）";
export const parameters = {
  type: "object",
  required: ["projectId", "taskId", "annotationId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    taskId: { type: "string", description: "便利贴所属任务 ID" },
    annotationId: { type: "string", description: "便利贴 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteAnnotation(input.projectId, input.taskId, input.annotationId);
  return { content: [{ type: "text", text: "已删除便利贴" }] };
}
