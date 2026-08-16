import { createDataAccess } from "../lib/data.js";

export const name = "ask_project";
export const description = "项目级问答编排：按 scope 返回项目总结/风险/决策批注/时间线/文件清单/需求列表/方案列表，all 返回分节完整报告，供 Agent 一次性掌握项目全貌";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    scope: {
      type: "string",
      enum: ["summary", "risks", "decisions", "timeline", "files", "requirements", "plans", "all"],
      description: "查询范围：summary=完整总结 / risks=风险列表 / decisions=决策批注 / timeline=项目时间线 / files=文件清单 / requirements=需求列表 / plans=方案列表 / all=全部（默认 all）",
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  // P2-2：存在性校验由 askProject 内部轻量 SELECT 完成，项目不存在时错误自然上抛
  // 不再前置 getProject（全量任务树），避免三重存在性检查
  const scope = input.scope || "all";
  const r = data.askProject(input.projectId, scope);
  // scope=risks 时无 summary 节，项目名兜底用 projectId
  const projectName = r.summary?.project?.name || input.projectId;

  const lines = [`📊 项目「${projectName}」问答报告`, `查询范围: ${scope}`, ""];
  if (scope === "all" || scope === "summary") lines.push(...formatSummary(r.summary));
  // risks 仅 scope=risks 单独输出（all 时已包含在 summary 风险节，不重复）
  if (scope === "risks") lines.push(...formatRisks(r.risks));
  if (scope === "all" || scope === "decisions") lines.push(...formatDecisions(r.decisions));
  if (scope === "all" || scope === "timeline") lines.push(...formatTimeline(r.timeline));
  if (scope === "all" || scope === "files") lines.push(...formatFiles(r.files));
  if (scope === "all" || scope === "requirements") lines.push(...formatRequirements(r.requirements));
  if (scope === "all" || scope === "plans") lines.push(...formatPlans(r.plans));

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ===== 各 scope 格式化（Agent 友好 + 防刷屏截断）=====

/** 总结分节（与 summarize_project 输出同构） */
function formatSummary(s) {
  const lines = ["【总结】", `状态: ${s.project.status} | 完成度: ${s.project.progress}%`, `一句话: ${s.summary}`, ""];

  lines.push(`--- 已完成 (${s.completed.length}) ---`);
  if (s.completed.length === 0) lines.push("  （无）");
  else for (const name of s.completed) lines.push(`  ☑ ${name}`);

  lines.push(`--- 未完成 (${s.pending.length}) ---`);
  if (s.pending.length === 0) lines.push("  （无）");
  else for (const name of s.pending) lines.push(`  ☐ ${name}`);

  lines.push(`--- 延期 (${s.delayed.length}) ---`);
  if (s.delayed.length === 0) lines.push("  （无）");
  else for (const d of s.delayed) lines.push(`  ⚠️ ${d.task}（延期 ${d.days} 天）`);

  lines.push(`--- 风险 (${s.risks.length}) ---`);
  if (s.risks.length === 0) lines.push("  暂无风险");
  else {
    const icon = { high: "🔴", medium: "🟡", low: "⚪" };
    for (const r of s.risks) lines.push(`  ${icon[r.level] || "•"} [${r.level}] ${r.desc}`);
  }

  lines.push(`--- 待确认批注 (${s.pendingAnnotations.length}) ---`);
  if (s.pendingAnnotations.length === 0) lines.push("  （无）");
  else for (const a of s.pendingAnnotations) lines.push(`  📌 ${a.task}: 「${a.content}」[${a.kind}]（${formatTime(a.createdAt)}）`);

  lines.push("--- 下一步 ---");
  s.nextSteps.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
  lines.push("");
  return lines;
}

/** 风险列表（scope=risks） */
function formatRisks(risks) {
  const lines = ["【风险】"];
  if (risks.length === 0) {
    lines.push("  暂无风险", "");
    return lines;
  }
  const icon = { high: "🔴", medium: "🟡", low: "⚪" };
  for (const r of risks) lines.push(`  ${icon[r.level] || "•"} [${r.level}] ${r.desc}`);
  lines.push("");
  return lines;
}

/** 决策批注列表（scope=decisions，限 20 条防刷屏） */
function formatDecisions(decisions) {
  const lines = ["【决策】"];
  if (decisions.length === 0) {
    lines.push("  暂无决策批注", "");
    return lines;
  }
  const shown = decisions.slice(0, 20);
  for (const d of shown) {
    const mark = d.confirmed ? "✅" : "🕓";
    lines.push(`  ${mark} ${d.taskName}：「${cut(plain(d.content), 60)}」（${formatTime(d.createdAt)}）[ID: ${d.id}]`);
  }
  if (decisions.length > shown.length) lines.push(`  …及更多 ${decisions.length - shown.length} 条`);
  lines.push("");
  return lines;
}

/** 时间线（scope=timeline） */
function formatTimeline(timeline) {
  const lines = ["【时间线】"];
  if (timeline.length === 0) {
    lines.push("  暂无时间线记录", "");
    return lines;
  }
  const TYPE_ICON = { task: "📋", annotation: "📌", note: "🗒️", summary: "📝" };
  for (const e of timeline) {
    const icon = TYPE_ICON[e.type] || "•";
    let label;
    if (e.type === "task") label = `创建任务「${e.title}」`;
    else if (e.type === "annotation") label = `批注[${e.kind}]「${e.title}」@ ${e.taskName}`;
    else if (e.type === "note") label = `备注「${e.title}」`;
    else label = `总结[${e.source === "auto" ? "自动" : "手动"}]：${e.title}`;
    lines.push(`  ${icon} ${label}（${formatTime(e.createdAt)}）`);
  }
  lines.push("");
  return lines;
}

/** 文件资产清单（scope=files，名称/摘要截断） */
function formatFiles(files) {
  const lines = ["【文件资产】"];
  if (files.length === 0) {
    lines.push("  暂无文件", "");
    return lines;
  }
  for (const f of files) {
    const size = f.size != null ? `, ${formatSize(f.size)}` : "";
    const digest = f.digest ? `：${cut(plain(f.digest), 50)}` : "";
    lines.push(`  📄 ${cut(f.name, 40)} (${f.ext || "?"}${size})${digest} [ID: ${f.id}]`);
  }
  lines.push("");
  return lines;
}

/** 需求列表（scope=requirements，优先级/状态/关联方案数，限 30 条防刷屏） */
function formatRequirements(reqs) {
  const lines = ["【需求】"];
  if (reqs.length === 0) {
    lines.push("  暂无需求", "");
    return lines;
  }
  const shown = reqs.slice(0, 30);
  for (const r of shown) {
    const plan = r.planCount > 0 ? `, 关联方案 ${r.planCount}` : "";
    lines.push(`  📋 [${r.priority || "P3"}] ${cut(r.name, 40)}（${r.status}${plan}）[ID: ${r.id}]`);
  }
  if (reqs.length > shown.length) lines.push(`  …及更多 ${reqs.length - shown.length} 条`);
  lines.push("");
  return lines;
}

/** 方案列表（scope=plans，状态/已转任务标记，限 30 条防刷屏） */
function formatPlans(plans) {
  const lines = ["【方案】"];
  if (plans.length === 0) {
    lines.push("  暂无方案", "");
    return lines;
  }
  const shown = plans.slice(0, 30);
  for (const p of shown) {
    const converted = p.taskId ? " ➜ 已转任务" : "";
    lines.push(`  📄 ${cut(p.title, 40)}（${p.status}${converted}）[ID: ${p.id}]`);
  }
  if (plans.length > shown.length) lines.push(`  …及更多 ${plans.length - shown.length} 条`);
  lines.push("");
  return lines;
}

// ===== 工具函数 =====

/** 富文本/HTML → 纯文本（去标签、压缩空白） */
function plain(s) {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** 截断限长（防刷屏） */
function cut(s, max = 30) {
  const t = String(s ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** ISO 时间 → 可读格式（UTC，去毫秒）；纯日期原样展示（与 timeline 数据格式一致） */
function formatTime(iso) {
  if (!iso) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return String(iso).replace("T", " ").slice(0, 19) + "Z";
}

/** 字节数 → 可读大小 */
function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
