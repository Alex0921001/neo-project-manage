import { createDataAccess } from "../lib/data.js";

export const name = "get_project_file";
export const description = "获取项目单个文件详情（路径/大小/摘要/登记时间/索引状态）";
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
  const file = data.getFile(input.projectId, input.fileId);

  const lines = [
    `📄 ${file.name}`,
    `路径: ${file.path || "-"}`,
    `类型: ${file.ext || "无"}`,
    `大小: ${formatSize(file.size)}`,
    `摘要: ${file.digest || "-"}`,
    `索引状态: ${file.indexed ? "已索引" : "未索引"}`,
    `登记时间: ${file.uploadedAt || "-"}`,
    `文件 ID: ${file.id}`,
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** 字节数 → 人类可读（B/KB/MB/GB），无值返回「未知」 */
function formatSize(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}
