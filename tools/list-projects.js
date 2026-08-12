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
  // 建 项目集ID → 名称 映射（用于标注归属项目集）
  const setIdToName = new Map(
    data.listProjectSets().map((s) => [s.id, s.name])
  );
  const lines = projects.map((p) => {
    const displayStatus = data.computeStatus(p);
    const statusIcon = { "待开始": "⚪", "进行中": "🔵", "已完成": "🟢", "已延期": "🔴", "已取消": "⚪" }[displayStatus] || "⚪";
    // 已归档标记：图标前缀包裹 + 名称后缀标记，Agent 可一眼区分归档项目
    const archivedMark = p.archived ? " [已归档]" : "";
    // 描述可能含换行，归一化为单行（对齐 list_tasks）
    const descText = p.description ? p.description.replace(/\s*\n+\s*/g, " ").trim() : "";
    const descPart = descText ? ` — ${descText}` : "";
    const membersText = p.members?.length ? ` [成员: ${p.members.join(", ")}]` : "";
    const planParts = [p.planStart, p.planEnd].filter(Boolean);
    const planText = planParts.length ? ` [计划: ${planParts.join(" ~ ")}]` : "";
    const setText =
      p.projectSetId && setIdToName.has(p.projectSetId)
        ? ` [项目集: ${setIdToName.get(p.projectSetId)}]`
        : "";
    // 风格对齐 list_tasks：图标 名称 — 描述 [状态] [成员] [计划] [统计] [项目集] [创建] [ID]
    return `${statusIcon} ${p.name}${archivedMark}${descPart} [状态: ${displayStatus}]${membersText}${planText} [任务: ${p.taskCount}（未完成 ${p.incompleteTaskCount}）] [文件: ${p.fileCount}] [备注: ${p.noteCount}]${setText} [创建: ${p.createdAt}] [ID: ${p.id}]`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
