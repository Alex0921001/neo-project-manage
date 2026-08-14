import { createDataAccess } from "../lib/data.js";

export const name = "list_plans";
export const description = "列出项目下的方案（分页 limit/offset，可按标题关键字 keyword 搜索；含评论数、状态、已转任务标记，按创建时间倒序）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "精确查找：方案 ID（填则仅返回该方案）" },
    limit: { type: "integer", description: "每页条数（默认 10，最大 100）" },
    offset: { type: "integer", description: "偏移量（默认 0）" },
    keyword: { type: "string", description: "按标题模糊搜索" },
    status: { type: "string", description: "按状态筛选：草稿 / 进行中 / 已采纳 / 已废弃 / 已转任务" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  // 边界收敛：limit 默认 10、clamp 1~100；offset 非负（与 REST 接口一致）
  const safeLimit = input.limit === undefined ? 10 : Math.min(Math.max(parseInt(input.limit) || 10, 1), 100);
  const safeOffset = Math.max(parseInt(input.offset) || 0, 0);
  const { total, items } = data.listPlans(input.projectId, {
    id: input.id || undefined,
    limit: safeLimit,
    offset: safeOffset,
    keyword: input.keyword?.trim() || undefined,
    status: input.status || undefined,
  });
  if (items.length === 0) {
    return { content: [{ type: "text", text: "暂无方案" }] };
  }
  const lines = items.map((p) => {
    const parts = [`#${p.id.slice(0, 4)}《${p.title}》(${p.status})`, `评论 ${p.commentCount}`];
    if (p.taskName) parts.push(`已转任务: ${p.taskName} [${p.taskId}]`);
    return parts.join(" · ");
  });
  const head = `共 ${total} 条方案，本页 ${items.length} 条`;
  return { content: [{ type: "text", text: [head, ...lines].join("\n") }] };
}
