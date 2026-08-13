import { createDataAccess } from "../lib/data.js";

export const name = "create_project_folder";
export const description = "在项目下创建文件夹（多层嵌套，parentId 为空=根目录；同级重名拒绝）";
export const parameters = {
  type: "object",
  required: ["projectId", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "文件夹名称（≤50 字符，同级内唯一）" },
    parentId: { type: "string", description: "父文件夹 ID（可选，不传=根目录）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const folder = data.createFolder(input.projectId, {
    name: input.name,
    parentId: input.parentId || null,
  });
  return {
    content: [
      {
        type: "text",
        text: `已创建文件夹「${folder.name}」\nID: ${folder.id}\n父级: ${folder.parentId ? `文件夹 ${folder.parentId}` : "根目录"}`,
      },
    ],
  };
}
