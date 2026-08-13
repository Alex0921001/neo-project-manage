import { createDataAccess } from "../lib/data.js";

export const name = "create_note";
export const description = "给项目添加备注（富文本 HTML，内容不能为空）";
export const parameters = {
  type: "object",
  required: ["projectId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    content: { type: "string", description: "备注内容（富文本 HTML，仅图片时视为空）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const note = data.createNote(input.projectId, { content: input.content });
  return { content: [{ type: "text", text: `已添加备注 [ID: ${note.id}]` }] };
}
