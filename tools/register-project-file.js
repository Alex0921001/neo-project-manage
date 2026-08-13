import { createDataAccess } from "../lib/data.js";

export const name = "register_project_file";
export const description = "按本地文件路径登记文件资产到项目（读取 size/ext 元信息，digest 可选）。登记失败（路径失效）时 size/ext 为空但仍登记，用于 Agent 侧把文件挂到项目资产清单。";
export const parameters = {
  type: "object",
  required: ["projectId", "filePath"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    filePath: { type: "string", description: "文件绝对路径" },
    digest: { type: "string", description: "正文摘要（可选，限 500 字）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const f = data.addFile(input.projectId, input.filePath, input.digest);
  return {
    content: [
      {
        type: "text",
        text: `已登记文件「${f.name}」到项目\nID: ${f.id}\n路径: ${f.path}\n大小: ${f.size ?? "未知"}\n类型: ${f.ext ?? "未知"}`,
      },
    ],
  };
}
