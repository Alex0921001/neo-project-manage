import { createDataAccess } from "../lib/data.js";

export const name = "get_project_risks";
export const description = "获取项目按 7 条风险规则计算后的风险条目（JSON 结构化，不触发存档）。返回 risks 数组（等级 high→medium→low，含来源标记 kind）与当前项目风险配置 riskConfig，便于 Agent 判断风险状态与规则生效情况。";
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

  const cfg = data.getRiskConfig(input.projectId);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            projectId: input.projectId,
            projectName: s.project.name,
            risks: s.risks,
            riskConfig: cfg ? cfg.rules : null,
          },
          null,
          2
        ),
      },
    ],
  };
}
