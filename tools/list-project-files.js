import { createDataAccess } from "../lib/data.js";

export const name = "list_project_files";
export const description = "列出项目文件资产清单（含大小/类型/摘要/索引状态/所属文件夹）。可按文件夹筛选（folderId 传 root=根目录、具体 ID=该文件夹、不传=全部），可按文件名搜索。";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    folderId: { type: "string", description: "文件夹 ID（可选；root=根目录文件；具体 ID=该文件夹下文件，不含子夹；不传=全部）" },
    name: { type: "string", description: "按文件名模糊搜索（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.getProject(input.projectId);
  if (!project) throw new Error(`项目 ${input.projectId} 不存在`);

  // folderId：'root' → null（根目录）；具体 id → 该夹；不传 → undefined（全部）
  let folderId;
  if (input.folderId === "root") folderId = null;
  else if (input.folderId) folderId = input.folderId;

  const files = data.listFiles(input.projectId, { folderId, name: input.name || undefined });
  if (files.length === 0) {
    const scope = input.folderId === "root" ? "根目录" : input.folderId ? `文件夹 ${input.folderId}` : "全部";
    return { content: [{ type: "text", text: `项目「${project.name}」${scope}暂无文件资产` }] };
  }

  // 文件夹名映射（显示归属）
  const folderNames = new Map();
  const walk = (nodes) => nodes.forEach((n) => { folderNames.set(n.id, n.name); walk(n.children || []); });
  walk(project.folders || []);

  const lines = [`📄 项目「${project.name}」文件清单（共 ${files.length} 个）`, ""];
  for (const f of files) {
    const folderLabel = f.folderId ? `[文件夹: ${folderNames.get(f.folderId) || f.folderId}]` : "[文件夹: 根目录]";
    lines.push(
      `- 📄 ${f.name} ${folderLabel} [路径: ${f.path || "-"}] [类型: ${f.ext || "无"}] [大小: ${formatSize(f.size)}] ` +
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

/** digest 展示（完整返回，不截断） */
function shortDigest(digest) {
  if (!digest) return "-";
  return digest;
}
