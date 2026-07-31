import { createDataAccess } from "../lib/data.js";

export const name = "list_annotations";
export const description = "列出任务下的便利贴（批注）";
export const parameters = {
  type: "object",
  required: ["taskId"],
  properties: {
    taskId: { type: "string", description: "任务 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const list = data.getTaskAnnotations(input.taskId);
  if (list.length === 0) {
    return { content: [{ type: "text", text: "该任务暂无便利贴" }] };
  }
  const lines = list.map((a) =>
    `${a.confirmed ? "✅" : "📝"} ${a.content} [ID: ${a.id}] [创建: ${a.createdAt}${a.confirmed ? " | 已确认" : ""}]`
  );
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
