import { createDataAccess } from "../lib/data.js";

export const name = "delete_project_folder";
export const description = "删除文件夹（真删除语义）：递归删除该文件夹及其所有子孙文件夹，并级联删除这些文件夹内的文件登记（磁盘文件不受影响），此操作不可恢复。";
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
  const r = data.deleteFolder(input.projectId, input.folderId);
  const parts = [`已删除文件夹 ${input.folderId}`];
  if (r?.deletedFolders > 1) parts.push(`含 ${r.deletedFolders - 1} 个子文件夹`);
  if (r?.deletedFiles) parts.push(`级联删除 ${r.deletedFiles} 个文件登记`);
  parts.push("（磁盘文件不受影响）");
  return { content: [{ type: "text", text: parts.join("，") }] };
}
