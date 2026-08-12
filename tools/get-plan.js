import { createDataAccess } from "../lib/data.js";

export const name = "get_plan";
export const description = "获取方案详情（含全部评论、转任务关联）";
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
  const plan = data.getPlan(input.projectId, input.planId);
  const lines = [
    `方案「${plan.title}」(${plan.status})`,
    `创建: ${plan.createdAt}`,
  ];
  if (plan.taskName) lines.push(`已转任务: ${plan.taskName} [${plan.taskId}]`);
  if (plan.content) lines.push(`内容: ${plan.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)}`);
  if (plan.comments.length) {
    lines.push(`评论 ${plan.comments.length} 条:`);
    for (const c of plan.comments) lines.push(`  ${c.createdAt.slice(5, 16)} ${c.content.slice(0, 100)}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
