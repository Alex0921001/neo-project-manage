import { createDataAccess } from "../lib/data.js";

export const name = "list_project_files";
export const description = "列出项目文件资产清单（含大小/类型/摘要/索引状态）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.getProject(input.projectId);
  if (!project) throw new Error(`项目 ${input.projectId} 不存在`);

  const files = project.files || [];
  if (files.length === 0) {
    return { content: [{ type: "text", text: `项目「${project.name}」暂无文件资产` }] };
  }

  const lines = [`📄 项目「${project.name}」文件清单（共 ${files.length} 个）`, ""];
  for (const f of files) {
    lines.push(
      `- 📄 ${f.name} [类型: ${f.ext || "无"}] [大小: ${formatSize(f.size)}] ` +
        `[摘要: ${shortDigest(f.digest)}] [索引: ${f.indexed ? "已索引" : "未索引"}] [登记: ${f.uploadedAt}] [ID: ${f.id}]`
    );
  }
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

/** digest 截断展示（默认前 40 字，超长加省略号） */
function shortDigest(digest, max = 40) {
  if (!digest) return "-";
  return digest.length > max ? `${digest.slice(0, max)}…` : digest;
}
