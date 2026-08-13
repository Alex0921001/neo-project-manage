import { createDataAccess } from "../lib/data.js";

export const name = "list_project_risks";
export const description = "跨项目风险汇总：按项目集（projectSetId）或全部项目返回各项目 7 条规则计算后的风险条目与等级统计，供巡检/汇报。单项目场景请用 get_project_risks。";
export const parameters = {
  type: "object",
  properties: {
    projectSetId: { type: "string", description: "项目集 ID（可选：限定该集下项目；不传=全部项目）" },
    includeNoRisk: { type: "boolean", description: "是否包含无风险项目（默认 false）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const projects = data.listProjects(input.projectSetId !== undefined ? input.projectSetId : undefined, "");

  const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
  const rows = [];
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;
  let riskProjects = 0;

  for (const p of projects) {
    const s = data.summarizeProject(p.id);
    if (!s) continue;
    const risks = (s.risks || []).sort((a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3));
    if (risks.length === 0 && !input.includeNoRisk) continue;
    if (risks.length > 0) riskProjects++;
    for (const r of risks) {
      if (r.level === "high") totalHigh++;
      else if (r.level === "medium") totalMedium++;
      else totalLow++;
    }
    rows.push({ projectId: p.id, projectName: p.name, riskCount: risks.length, risks });
  }

  const result = {
    summary: {
      projectCount: projects.length,
      riskProjects,
      totalRisks: totalHigh + totalMedium + totalLow,
      high: totalHigh,
      medium: totalMedium,
      low: totalLow,
    },
    projects: rows,
  };
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
