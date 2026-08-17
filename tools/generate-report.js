import { createDataAccess } from "../lib/data.js";

export const name = "generate_report";
export const description = "按时间范围一键生成项目周报/阶段总结（Markdown）。range 支持 thisWeek=本周 / lastWeek=上周 / last7days=近7天 / custom=自定义（需 startDate+endDate）。完成项按任务 done_at 统计（非创建时间），进行中/风险/下周建议沿用现有规则。";
export const parameters = {
  type: "object",
  required: ["projectId", "range"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    range: { type: "string", enum: ["thisWeek", "lastWeek", "last7days", "custom"], description: "时间范围：thisWeek / lastWeek / last7days / custom" },
    startDate: { type: "string", description: "自定义范围起始日期 YYYY-MM-DD（range=custom 必填）" },
    endDate: { type: "string", description: "自定义范围结束日期 YYYY-MM-DD（range=custom 必填）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { markdown } = data.generateReport(input.projectId, {
    range: input.range,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return { content: [{ type: "text", text: markdown }] };
}
