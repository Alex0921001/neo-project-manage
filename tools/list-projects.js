import { createDataAccess } from "../lib/data.js";

export const name = "list_projects";
export const description = "列出项目（可按项目集 ID 筛选、按名称模糊搜索）";
export const parameters = {
  type: "object",
  properties: {
    projectSetId: { type: "string", description: "项目集 ID（可空，传空字符串查未归类项目）" },
    keyword: { type: "string", description: "按项目名模糊匹配（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const projects = data.listProjects(input.projectSetId, input.keyword);
  if (projects.length === 0) {
    return { content: [{ type: "text", text: "暂无项目" }] };
  }
  const lines = projects.map(
    (p) => {
      const displayStatus = data.computeStatus(p);
      const statusIcon = { "待开始": "⚪", "进行中": "🔵", "已完成": "🟢", "已延期": "🔴" }[displayStatus] || "⚪";
      return `${statusIcon} ${p.name} [状态: ${displayStatus}] [ID: ${p.id}]`;
    }
  );
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
