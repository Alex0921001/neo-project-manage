import { createDataAccess } from "../lib/data.js";

export const name = "get_project";
export const description = "获取项目详情（含任务列表和文件列表）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.getProject(input.id);
  if (!project) throw new Error(`项目 ${input.id} 不存在`);

  const statusIcon = { "待开始": "⚪", "进行中": "🔵", "已完成": "🟢", "已延期": "🔴" }[project.status] || "⚪";
  const lines = [
    `${statusIcon} ${project.name}`,
    `描述: ${project.description || "-"}`,
    `状态: ${project.status}`,
    `成员: ${project.members?.join(", ") || "-"}`,
    `计划: ${project.planStart || "-"} ~ ${project.planEnd || "-"}`,
    `--- 任务 (${project.tasks?.length || 0}) ---`,
  ];
  for (const t of project.tasks || []) {
    lines.push(`  ${t.done ? "☑" : "☐"} ${t.index}. ${t.name}${t.description ? ` — ${t.description}` : ""} [ID: ${t.id}]`);
  }
  lines.push(`--- 文件 (${project.files?.length || 0}) ---`);
  for (const f of project.files || []) {
    lines.push(`  📄 ${f.name} (${f.uploadedAt}) [ID: ${f.id}]`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
