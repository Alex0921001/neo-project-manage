import { createDataAccess } from "../lib/data.js";

export const name = "list_project_risks";
export const description = "跨项目风险汇总：仅统计非归档且状态为进行中/待开始的项目，且只保留 high/medium 风险（low 不列入、不计入统计）；projectCount 按过滤后口径。可按项目集（projectSetId）限定，供巡检/汇报。单项目场景请用 get_project_risks。";
export const parameters = {
  type: "object",
  properties: {
    projectSetId: { type: "string", description: "项目集 ID（可选：限定该集下项目；不传=全部项目）" },
    includeNoRisk: { type: "boolean", description: "是否包含无中高风险项目（默认 false；计入 projectCount，riskCount=0）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const projects = data.listProjects(input.projectSetId !== undefined ? input.projectSetId : undefined, "");

  // 口径（与 data.js scanMessages 的 risk 生成口径一致，V2.3 review）：
  // 项目过滤：非归档 + 原始 status∈{进行中,待开始}；风险过滤：仅 high/medium（low 不入列不计数）
  const LEVEL_ORDER = { high: 0, medium: 1 };
  const included = [];
  for (const p of projects) {
    if (p.archived) continue;
    if (p.status !== "进行中" && p.status !== "待开始") continue;
    included.push(p);
  }

  const rows = [];
  let totalHigh = 0;
  let totalMedium = 0;
  let riskProjects = 0;

  for (const p of included) {
    const s = data.summarizeProject(p.id);
    if (!s) continue;
    const risks = (s.risks || [])
      .filter((r) => r.level === "high" || r.level === "medium")
      .sort((a, b) => (LEVEL_ORDER[a.level] ?? 2) - (LEVEL_ORDER[b.level] ?? 2));
    if (risks.length === 0 && !input.includeNoRisk) continue;
    if (risks.length > 0) riskProjects++;
    for (const r of risks) {
      if (r.level === "high") totalHigh++;
      else totalMedium++;
    }
    rows.push({ projectId: p.id, projectName: p.name, riskCount: risks.length, risks });
  }

  const result = {
    summary: {
      projectCount: included.length, // 过滤后口径（非归档 + 进行中/待开始）
      riskProjects,
      totalRisks: totalHigh + totalMedium,
      high: totalHigh,
      medium: totalMedium,
      low: 0, // 口径收窄：low 不计入（字段保留防消费者结构破坏）
    },
    projects: rows,
  };
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
