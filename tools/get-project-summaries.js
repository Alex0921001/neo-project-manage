import { createDataAccess } from "../lib/data.js";

export const name = "get_project_summaries";
export const description = "获取项目历史总结（最近 N 条，按时间倒序，最新在前）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    limit: { type: "integer", minimum: 1, maximum: 50, description: "返回条数（默认 10，最多 50）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.getProject(input.projectId);
  if (!project) throw new Error(`项目 ${input.projectId} 不存在`);

  const limit = input.limit ?? 10;
  const list = data.getProjectSummaries(input.projectId, limit);
  if (list.length === 0) {
    return { content: [{ type: "text", text: `项目「${project.name}」暂无历史总结` }] };
  }

  const lines = [`📝 项目「${project.name}」历史总结（最近 ${list.length} 条，最新在前）`, ""];
  for (const s of list) {
    lines.push(
      `- [${formatTime(s.createdAt)}] [${s.source === "auto" ? "自动" : "手动"}] ${shortSummary(s.content)} [ID: ${s.id}]`
    );
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** ISO 时间 → 可读格式（UTC，去毫秒） */
function formatTime(iso) {
  if (!iso) return "-";
  return iso.replace("T", " ").slice(0, 19) + "Z";
}

/** content 为总结 JSON 字符串，截断展示避免刷屏（默认前 80 字，压缩空白） */
function shortSummary(content, max = 80) {
  if (!content) return "-";
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
