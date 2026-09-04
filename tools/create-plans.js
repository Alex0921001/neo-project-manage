import { createDataAccess } from "../lib/data.js";

export const name = "create_plans";
export const description = "批量创建方案（最多 50 个，事务包裹：任一条校验失败整体回滚）。每项含 title（必填）、content（富文本 HTML）、requirementIds/taskIds（关联，可选）。新方案默认草稿状态。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "方案列表（最多 50 个）",
      items: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "方案标题（最长 100 字）" },
          content: { type: "string", description: "方案内容（富文本 HTML）" },
          requirementIds: { type: "array", items: { type: "string" }, description: "关联需求 ID 列表（可选）" },
          taskIds: { type: "array", items: { type: "string" }, description: "关联任务 ID 列表（可选，须属于本项目）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多创建 50 个方案");
  const created = data.createPlans(input.projectId, input.items.map((it) => ({
    title: it.title,
    content: it.content,
    requirementIds: it.requirementIds,
    taskIds: it.taskIds,
  })));
  const lines = [`✅ 已批量创建 ${created.length} 个方案：`];
  for (const p of created) lines.push(`  - ${p.title} [${p.status}] [ID: ${p.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
