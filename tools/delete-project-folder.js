import { createDataAccess } from "../lib/data.js";

export const name = "delete_project_folder";
export const description = "删除文件夹（内容提升语义）：其下文件和子文件夹整体提升到被删夹的父级，不级联删除任何文件、不丢结构。";
export const parameters = {
  type: "object",
  required: ["projectId", "folderId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    folderId: { type: "string", description: "文件夹 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteFolder(input.projectId, input.folderId);
  return { content: [{ type: "text", text: `已删除文件夹 ${input.folderId}，其下文件与子文件夹已提升到上级目录` }] };
}
