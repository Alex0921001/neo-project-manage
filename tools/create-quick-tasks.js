import { createDataAccess } from "../lib/data.js";

export const name = "create_quick_tasks";
export const description = "批量新增临时任务（随手记，最多 50 个，事务包裹：任一条校验失败整体回滚）。每项含 content（必填）。不关联项目。";
export const parameters = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      description: "临时任务列表（最多 50 个）",
      items: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "string", description: "临时任务内容" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多创建 50 个临时任务");
  const created = data.createQuickTasks(input.items.map((it) => ({ content: it.content })));
  const lines = [`✅ 已批量新增 ${created.length} 个临时任务：`];
  for (const t of created) lines.push(`  - ${t.content} [ID: ${t.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
