import { createDataAccess } from "../lib/data.js";

export const name = "get_plan";
export const description = "获取方案详情（含全部评论、转任务关联）；支持仅凭方案 ID 或唯一短前缀全局查询，projectId 可不传（传了则校验归属）";
export const parameters = {
  type: "object",
  required: ["planId"],
  properties: {
    projectId: { type: "string", description: "项目 ID（可选；不传则全局查询，传了则校验归属）" },
    planId: { type: "string", description: "方案 ID（完整 ID 或唯一短前缀）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const plan = data.getPlan(input.projectId || null, input.planId);
  const lines = [
    `方案「${plan.title}」(${plan.status}) [ID: ${plan.id}]`,
    `所属项目: ${plan.projectName || "-"} [ID: ${plan.projectId}]`,
    `创建: ${plan.createdAt}`,
  ];
  if (plan.taskName) lines.push(`已转任务: ${plan.taskName} [${plan.taskId}]`);
  if (plan.content) lines.push(`内容: ${plan.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}`);
  if (plan.comments.length) {
    lines.push(`评论 ${plan.comments.length} 条:`);
    for (const c of plan.comments) lines.push(`  ${c.createdAt.slice(5, 16)} ${c.content}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
