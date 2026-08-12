import { createDataAccess } from "../lib/data.js";

export const name = "list_plans";
export const description = "列出项目下的方案（含评论数、状态、已转任务标记，按创建时间倒序）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const plans = data.listPlans(input.projectId);
  if (plans.length === 0) return { content: [{ type: "text", text: "暂无方案" }] };
  const lines = plans.map((p) => {
    const parts = [`#${p.id.slice(0, 4)}「${p.title}」(${p.status})`, `评论 ${p.commentCount}`];
    if (p.taskName) parts.push(`已转任务: ${p.taskName} [${p.taskId}]`);
    return parts.join(" · ");
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
