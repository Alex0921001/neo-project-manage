import { createDataAccess } from "../lib/data.js";

export const name = "delete_note";
export const description = "删除项目备注（项目级富文本备注，随项目详情查看与编辑）";
export const parameters = {
  type: "object",
  required: ["projectId", "noteId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    noteId: { type: "string", description: "备注 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteNote(input.projectId, input.noteId);
  return { content: [{ type: "text", text: `已删除备注 ${input.noteId}` }] };
}
