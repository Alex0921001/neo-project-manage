import { createDataAccess } from "../lib/data.js";

export const name = "delete_annotations";
export const description = "批量删除批注（一次删除多个便利贴，最多 50 个；不存在的 ID 会列出）";
export const parameters = {
  type: "object",
  required: ["projectId", "taskId", "ids"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    taskId: { type: "string", description: "便利贴所属任务 ID" },
    ids: {
      type: "array",
      description: "要删除的便利贴 ID 列表（最多 50 个）",
      items: { type: "string", description: "便利贴 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("ids 不能为空");
  if (input.ids.length > 50) throw new Error("单次最多删除 50 个批注");
  const result = data.deleteAnnotations(input.projectId, input.taskId, input.ids);
  let text = `已删除 ${result.deleted.length} 条批注`;
  if (result.notFound.length > 0) {
    text += `\n不存在的批注（已跳过）：${result.notFound.join(", ")}`;
  }
  return { content: [{ type: "text", text }] };
}
