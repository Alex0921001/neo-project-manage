import { createDataAccess } from "../lib/data.js";

export const name = "update_project_folder";
export const description = "更新文件夹：改名 + 换父级（可只传其一）。换父级防环（不能把自己/子孙设为父级），同级重名拒绝。";
export const parameters = {
  type: "object",
  required: ["projectId", "folderId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    folderId: { type: "string", description: "文件夹 ID" },
    name: { type: "string", description: "新名称（可选，≤50 字符）" },
    parentId: { type: "string", description: "新父文件夹 ID（可选；传空字符串=移到根目录）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const folder = data.updateFolder(input.projectId, input.folderId, {
    name: input.name,
    parentId: input.parentId === undefined ? undefined : input.parentId || null,
  });
  return {
    content: [
      {
        type: "text",
        text: `已更新文件夹\n名称: ${folder.name}\n父级: ${folder.parentId ? `文件夹 ${folder.parentId}` : "根目录"}\nID: ${folder.id}`,
      },
    ],
  };
}
