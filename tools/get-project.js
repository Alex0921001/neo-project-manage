import { createDataAccess } from "../lib/data.js";

export const name = "get_project";
export const description = "获取项目详情（含任务树/批注/文件/备注，覆盖归档、会话、项目集等全字段）";
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

  // 项目集名映射（标注归属）
  const setIdToName = new Map(data.listProjectSets().map((s) => [s.id, s.name]));
  const displayStatus = data.computeStatus(project);
  const statusIcon = { "待开始": "⚪", "进行中": "🔵", "已完成": "🟢", "已延期": "🔴", "已取消": "⚪" }[displayStatus] || "⚪";
  const archivedMark = project.archived ? ` [已归档${project.archivedAt ? ` ${project.archivedAt.slice(0, 10)}` : ""}]` : "";

  const lines = [
    `${statusIcon} ${project.name}${archivedMark}`,
    `描述: ${project.description || "-"}`,
    `状态: ${displayStatus}`,
    `项目集: ${project.projectSetId && setIdToName.has(project.projectSetId) ? setIdToName.get(project.projectSetId) : "未归类"} [ID: ${project.projectSetId || "-"}]`,
    `成员: ${project.members?.join(", ") || "-"}`,
    `计划: ${project.planStart || "-"} ~ ${project.planEnd || "-"}`,
    `关联会话: ${project.sessionIds?.length ? `${project.sessionIds.length} 个 [${project.sessionIds.join(", ")}]` : "无"}`,
  ];

  // 任务树（递归渲染：父任务 + 子任务缩进 + 批注/文件引用）
  lines.push(`--- 任务 (${countTasks(project.tasks)}) ---`);
  if (!project.tasks?.length) {
    lines.push("  （无）");
  } else {
    for (const t of project.tasks) renderTask(lines, t, 1);
  }

  lines.push(`--- 文件资产 (${project.files?.length || 0}) ---`);
  if (!project.files?.length) {
    lines.push("  （无）");
  } else {
    for (const f of project.files) {
      const sizeText = f.size != null ? formatSize(f.size) : "未知";
      const extText = f.ext ? ` [类型: ${f.ext}]` : "";
      const digestText = f.digest ? ` [摘要: ${short(f.digest, 40)}]` : "";
      const idxText = f.indexed ? " [已索引]" : " [未索引]";
      lines.push(`  📄 ${f.name}${extText} [大小: ${sizeText}]${digestText}${idxText} [登记: ${(f.uploadedAt || "").slice(0, 10)}] [ID: ${f.id}]`);
    }
  }

  lines.push(`--- 备注 (${project.notes?.length || 0}) ---`);
  if (!project.notes?.length) {
    lines.push("  （无）");
  } else {
    for (const n of project.notes) {
      lines.push(`  📝 ${short(plain(n.content), 60)} [创建: ${(n.createdAt || "").slice(0, 10)}] [ID: ${n.id}]`);
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** 递归渲染任务树（含批注/文件引用/子任务缩进） */
function renderTask(lines, t, depth) {
  const indent = "  ".repeat(depth);
  const statusIcon = t.done ? "✅" : "⬜";
  const dateText = [t.startDate, t.endDate].filter(Boolean).join(" ~ ");
  const parts = [`${indent}${statusIcon} ${t.name}`];
  if (t.description) parts.push(` — ${oneLine(t.description)}`);
  parts.push(` [ID: ${t.id}]`);
  if (t.done) parts.push(" [已完成]");
  if (t.assignees?.length) parts.push(` [成员: ${t.assignees.join("、")}]`);
  if (dateText) parts.push(` [日期: ${dateText}]`);
  lines.push(parts.join(""));

  // 批注
  if (t.annotations?.length) {
    lines.push(`${indent}  🏷 批注 (${t.annotations.length}):`);
    for (const a of t.annotations) {
      const kindText = a.kind ? ` [类型: ${a.kind}]` : "";
      const confirmText = a.confirmed ? " [已确认]" : " [待确认]";
      lines.push(`${indent}    ${short(plain(a.content), 50)}${kindText}${confirmText} [ID: ${a.id}]`);
    }
  }
  // 文件引用
  if (t.fileRefs?.length) {
    lines.push(`${indent}  📎 文件 (${t.fileRefs.length}):`);
    for (const f of t.fileRefs) {
      lines.push(`${indent}    ${f.name || f.id} [ID: ${f.id}]`);
    }
  }
  // 子任务
  if (t.subtasks?.length) {
    for (const s of t.subtasks) renderTask(lines, s, depth + 1);
  }
}

function countTasks(tasks) {
  let n = 0;
  const walk = (arr) => { for (const t of arr) { n++; if (t.subtasks?.length) walk(t.subtasks); } };
  walk(tasks || []);
  return n;
}

function oneLine(s) { return String(s ?? "").replace(/\s*\n+\s*/g, " ").trim(); }
function plain(s) { return String(s ?? "").replace(/<[^>]*>/g, "").trim(); }
function short(s, max = 40) { const t = String(s ?? "").trim(); return t.length > max ? `${t.slice(0, max)}…` : t; }
function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
