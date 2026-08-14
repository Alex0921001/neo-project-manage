import { createDataAccess } from "../lib/data.js";

export const name = "delete_project_file";
export const description = "删除文件登记（仅移除登记引用，不影响磁盘文件）";
export const parameters = {
  type: "object",
  required: ["projectId", "fileId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    fileId: { type: "string", description: "文件 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteFile(input.projectId, input.fileId);
  return { content: [{ type: "text", text: `已删除文件登记 ${input.fileId}（磁盘文件不受影响）` }] };
}
