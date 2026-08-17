import { createDataAccess } from "../lib/data.js";

export const name = "get_project";
export const description = "获取项目详情（含任务树/批注/需求/方案/文件/备注，覆盖归档、会话、项目集等全字段）；view=summary 时输出轻量视图（仅任务名/状态/日期，省 token）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "项目 ID" },
    view: { type: "string", enum: ["summary"], description: "view=summary 轻量模式：仅项目头 + 任务名/状态/日期（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.getProject(input.id);
  if (!project) throw new Error(`项目 ${input.id} 不存在`);
  const isSummary = input.view === "summary";

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

  // 任务树（递归渲染：父任务 + 子任务缩进 + 批注/文件引用；summary 模式仅名称/状态/日期）
  const filesById = new Map((project.files || []).map((f) => [f.id, f]));
  lines.push(`--- 任务 (${countTasks(project.tasks)}) ---`);
  if (!project.tasks?.length) {
    lines.push("  （无）");
  } else {
    for (const t of project.tasks) renderTask(lines, t, 1, isSummary, filesById);
  }

  // summary 模式：跳过需求/方案/文件/备注明细，到此为止
  if (isSummary) {
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // 需求清单（T1 data.getProject 追加字段；未合入前为 undefined，容错按 0 处理）
  const requirements = project.requirements || [];
  lines.push(`--- 需求 (${requirements.length}) ---`);
  if (!requirements.length) {
    lines.push("  （无）");
  } else {
    for (const r of requirements) {
      const icon = r.status === "已完成" ? "✅" : r.status === "已取消" ? "⛔" : "⬜";
      // priority 即 "P0"-"P5" 字符串（与 list_requirements 一致），直接输出避免双 P
      const pText = r.priority != null ? ` [${r.priority}]` : "";
      const sText = r.status ? ` [${r.status}]` : "";
      const planText = r.planCount ? ` [关联方案 ${r.planCount}]` : "";
      lines.push(`  ${icon} ${r.name}${pText}${sText}${planText} [ID: ${r.id}]`);
    }
  }

  // 方案清单（同上，T1 追加字段；commentCount/taskName 空值不输出对应标记）
  const plans = project.plans || [];
  lines.push(`--- 方案 (${plans.length}) ---`);
  if (!plans.length) {
    lines.push("  （无）");
  } else {
    for (const p of plans) {
      const sText = p.status ? ` [${p.status}]` : "";
      const commentText = p.commentCount ? ` [评论 ${p.commentCount}]` : "";
      const taskText = p.taskName ? ` [转任务: ${p.taskName}]` : "";
      lines.push(`  ${p.title}${sText}${commentText}${taskText} [ID: ${p.id}]`);
    }
  }

  lines.push(`--- 文件资产 (${project.files?.length || 0}) ---`);
  if (!project.files?.length) {
    lines.push("  （无）");
  } else {
    for (const f of project.files) {
      const sizeText = f.size != null ? formatSize(f.size) : "未知";
      const extText = f.ext ? ` [类型: ${f.ext}]` : "";
      const digestText = f.digest ? ` [摘要: ${f.digest}]` : "";
      const idxText = f.indexed ? " [已索引]" : " [未索引]";
      lines.push(`  📄 ${f.name}${extText} [大小: ${sizeText}]${digestText}${idxText} [登记: ${(f.uploadedAt || "").slice(0, 10)}] [ID: ${f.id}]`);
    }
  }

  lines.push(`--- 备注 (${project.notes?.length || 0}) ---`);
  if (!project.notes?.length) {
    lines.push("  （无）");
  } else {
    for (const n of project.notes) {
      lines.push(`  📝 ${plain(n.content)} [创建: ${(n.createdAt || "").slice(0, 10)}] [ID: ${n.id}]`);
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** 递归渲染任务树（含批注/文件引用/子任务缩进；summary 模式仅名称/状态/日期） */
function renderTask(lines, t, depth, isSummary = false, filesById = new Map()) {
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

  // summary 模式：不展开批注/文件明细，仅继续递归子任务
  if (isSummary) {
    if (t.subtasks?.length) {
      for (const s of t.subtasks) renderTask(lines, s, depth + 1, true, filesById);
    }
    return;
  }

  // 批注
  if (t.annotations?.length) {
    lines.push(`${indent}  🏷 批注 (${t.annotations.length}):`);
    for (const a of t.annotations) {
      const kindText = a.kind ? ` [类型: ${a.kind}]` : "";
      const confirmText = a.confirmed ? " [已确认]" : " [待确认]";
      lines.push(`${indent}    ${plain(a.content)}${kindText}${confirmText} [ID: ${a.id}]`);
    }
  }
  // 文件引用（fileRefs 为 id 数组，映射到项目文件资产显示名称；文件已删时回退显示 id）
  if (t.fileRefs?.length) {
    lines.push(`${indent}  📎 文件 (${t.fileRefs.length}):`);
    for (const fid of t.fileRefs) {
      const f = filesById.get(fid);
      lines.push(`${indent}    ${f ? f.name : fid} [ID: ${fid}]`);
    }
  }
  // 子任务
  if (t.subtasks?.length) {
    for (const s of t.subtasks) renderTask(lines, s, depth + 1, false, filesById);
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
function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
