import { createDataAccess } from "../lib/data.js";

export const name = "create_annotations";
export const description = "批量创建批注（一次创建多个便利贴，最多 50 个）";
export const parameters = {
  type: "object",
  required: ["projectId", "taskId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    taskId: { type: "string", description: "便利贴所属任务 ID" },
    items: {
      type: "array",
      description: "批注列表（最多 50 个），每项含 content（必填）",
      items: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "string", description: "便利贴内容" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多创建 50 个批注");
  const anns = data.createAnnotations(input.projectId, input.taskId, input.items);
  const lines = anns.map((a) => `- ${a.content} [ID: ${a.id}]`);
  return { content: [{ type: "text", text: `已批量创建 ${anns.length} 条批注：\n${lines.join("\n")}` }] };
}
