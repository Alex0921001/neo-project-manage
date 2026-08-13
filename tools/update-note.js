import { createDataAccess } from "../lib/data.js";

export const name = "update_note";
export const description = "编辑项目备注内容（富文本 HTML，内容不能为空）";
export const parameters = {
  type: "object",
  required: ["projectId", "noteId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    noteId: { type: "string", description: "备注 ID" },
    content: { type: "string", description: "新的备注内容（富文本 HTML，仅图片时视为空）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const note = data.updateNote(input.projectId, input.noteId, { content: input.content });
  return { content: [{ type: "text", text: `已更新备注 [ID: ${note.id}]` }] };
}
