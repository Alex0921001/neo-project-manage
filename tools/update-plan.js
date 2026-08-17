import { createDataAccess } from "../lib/data.js";

export const name = "update_plan";
export const description = "编辑方案（标题/内容/状态/关联需求，传哪个改哪个；状态：草稿/进行中/已采纳/已废弃；requirementIds 全量替换关联）";
export const parameters = {
  type: "object",
  required: ["projectId", "planId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    planId: { type: "string", description: "方案 ID" },
    title: { type: "string", description: "方案标题（最长 100 字）" },
    content: { type: "string", description: "方案内容（富文本 HTML）" },
    status: { type: "string", enum: ["草稿", "进行中", "已采纳", "已废弃"], description: "方案状态" },
    requirementIds: { type: "array", items: { type: "string" }, description: "关联的需求 ID 列表（传则全量替换；空数组=清空关联）" },
    taskIds: { type: "array", items: { type: "string" }, description: "关联的任务 ID 列表（传则全量替换；空数组=清空关联；须属于本项目）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const plan = data.updatePlan(input.projectId, input.planId, {
    title: input.title,
    content: input.content,
    status: input.status,
    requirementIds: input.requirementIds,
    taskIds: input.taskIds,
  });
  return { content: [{ type: "text", text: `已更新方案「${plan.title}」[ID: ${plan.id}]（${plan.status}）` }] };
}
