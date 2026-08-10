import { createDataAccess } from "../lib/data.js";

export const name = "summarize_project";
export const description = "汇总项目全部结构化数据，生成状态总结（进度/延期/风险/待确认批注/文件资产/下一步建议）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const s = data.summarizeProject(input.projectId);
  if (!s) throw new Error(`项目 ${input.projectId} 不存在`);

  const { project, summary, completed, pending, delayed, risks, pendingAnnotations, files, nextSteps } = s;
  const lines = [
    `📊 项目「${project.name}」总结`,
    `状态: ${project.status} | 完成度: ${project.progress}%`,
    `一句话: ${summary}`,
  ];

  lines.push(`--- 已完成 (${completed.length}) ---`);
  if (completed.length === 0) lines.push("  （无）");
  else for (const name of completed) lines.push(`  ☑ ${name}`);

  lines.push(`--- 未完成 (${pending.length}) ---`);
  if (pending.length === 0) lines.push("  （无）");
  else for (const name of pending) lines.push(`  ☐ ${name}`);

  lines.push(`--- 延期 (${delayed.length}) ---`);
  if (delayed.length === 0) lines.push("  （无）");
  else for (const d of delayed) lines.push(`  ⚠️ ${d.task}（延期 ${d.days} 天）`);

  lines.push(`--- 风险 (${risks.length}) ---`);
  if (risks.length === 0) lines.push("  暂无风险");
  else {
    const icon = { high: "🔴", medium: "🟡", low: "⚪" };
    for (const r of risks) lines.push(`  ${icon[r.level] || "•"} [${r.level}] ${r.desc}`);
  }

  lines.push(`--- 待确认批注 (${pendingAnnotations.length}) ---`);
  if (pendingAnnotations.length === 0) lines.push("  （无）");
  else for (const a of pendingAnnotations) lines.push(`  📌 ${a.task}: 「${a.content}」[${a.kind}]（${formatTime(a.createdAt)}）`);

  lines.push(`--- 文件资产 (${files.length}) ---`);
  if (files.length === 0) lines.push("  （无）");
  else for (const f of files) lines.push(`  📄 ${f.name}${f.ext ? ` (${f.ext}, ${formatSize(f.size)})` : ""}`);

  lines.push("--- 下一步 ---");
  nextSteps.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** ISO 时间 → 可读格式（UTC，去毫秒，与 get_project_summaries 展示一致） */
function formatTime(iso) {
  if (!iso) return "-";
  return String(iso).replace("T", " ").slice(0, 19) + "Z";
}

/** 字节数 → 可读大小 */
function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
