import { createDataAccess } from "../lib/data.js";

export const name = "convert_plan_to_task";
export const description = "一键转任务：方案标题→任务名、方案内容→任务描述（仅已采纳状态可转；当前项目下创建，默认 P3 不分配成员/日期）；已转过的方案不能重复转换";
export const parameters = {
  type: "object",
  required: ["projectId", "planId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    planId: { type: "string", description: "方案 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.convertPlanToTask(input.projectId, input.planId);
  return {
    content: [{
      type: "text",
      text: `已转任务「${result.taskName}」[任务 ID: ${result.taskId}]，方案已标记关联`,
    }],
  };
}
