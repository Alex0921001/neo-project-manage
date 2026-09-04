import { createDataAccess } from "../lib/data.js";

export const name = "update_plans";
export const description = "批量更新方案（每项含 id + 可改字段 title/content/status/requirementIds/taskIds）。状态可选：草稿/进行中/已采纳/已废弃。约束逐条生效：标题/内容仅草稿/进行中可改；已转任务且任务存在时状态冻结。单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "方案列表（最多 50 个），每项含 id（必填）+ 可改字段",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "方案 ID" },
          title: { type: "string", description: "方案标题（最长 100 字）" },
          content: { type: "string", description: "方案内容（富文本 HTML）" },
          status: { type: "string", enum: ["草稿", "进行中", "已采纳", "已废弃"], description: "方案状态" },
          requirementIds: { type: "array", items: { type: "string" }, description: "关联需求 ID 列表（传则整体替换；空数组=清空关联）" },
          taskIds: { type: "array", items: { type: "string" }, description: "关联任务 ID 列表（传则整体替换；空数组=清空关联）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多更新 50 个方案");
  const res = data.updatePlans(input.projectId, input.items.map((it) => ({
    id: it.id,
    title: it.title,
    content: it.content,
    status: it.status,
    requirementIds: it.requirementIds,
    taskIds: it.taskIds,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push("成功：");
    for (const s of res.success) lines.push(`  - ${s.title} [ID: ${s.id}]`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
