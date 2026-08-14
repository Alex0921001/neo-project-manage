import { createDataAccess } from "../lib/data.js";

export const name = "move_project_file";
export const description = "移动文件登记到文件夹（folderId 不传/root/空串=移回根目录；不传 folderId 时无操作）";
export const parameters = {
  type: "object",
  required: ["projectId", "fileId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    fileId: { type: "string", description: "文件 ID" },
    folderId: { type: "string", description: "目标文件夹 ID（不传=不动；root/空串=根目录）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const folderId = input.folderId === undefined ? undefined : input.folderId === "" || input.folderId === "root" ? null : input.folderId;
  const f = data.moveFile(input.projectId, input.fileId, folderId);
  return {
    content: [{ type: "text", text: `已移动「${f.name}」→ ${f.folderId ? `文件夹 ${f.folderId}` : "根目录"}` }],
  };
}
