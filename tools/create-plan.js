import { createDataAccess } from "../lib/data.js";

export const name = "create_plan";
export const description = "新建方案（默认状态草稿，内容支持富文本 HTML）";
export const parameters = {
  type: "object",
  required: ["projectId", "title"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    title: { type: "string", description: "方案标题（最长 100 字）" },
    content: { type: "string", description: "方案内容（富文本 HTML，可空）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const plan = data.createPlan(input.projectId, input.title, input.content);
  return { content: [{ type: "text", text: `已创建方案「${plan.title}」[ID: ${plan.id}]（${plan.status}）` }] };
}
