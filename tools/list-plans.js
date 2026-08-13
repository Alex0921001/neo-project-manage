import { createDataAccess } from "../lib/data.js";

export const name = "list_plans";
export const description = "列出项目下的方案（分页 limit/offset，可按标题关键字 keyword 搜索；含评论数、状态、已转任务标记，按创建时间倒序）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    limit: { type: "integer", description: "每页条数（默认 10，最大 100）" },
    offset: { type: "integer", description: "偏移量（默认 0）" },
    keyword: { type: "string", description: "按标题模糊搜索" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { total, items } = data.listPlans(input.projectId, {
    limit: input.limit,
    offset: input.offset,
    keyword: input.keyword?.trim() || undefined,
  });
  if (items.length === 0) {
    return { content: [{ type: "text", text: "暂无方案" }] };
  }
  const lines = items.map((p) => {
    const parts = [`#${p.id.slice(0, 4)}《${p.title}》(${p.status})`, `评论 ${p.commentCount}`];
    if (p.taskName) parts.push(`已转任务: ${p.taskName} [${p.taskId}]`);
    return parts.join(" · ");
  });
  const head = `共 ${total} 条方案${input.limit ? `，本页 ${items.length} 条` : ""}`;
  return { content: [{ type: "text", text: [head, ...lines].join("\n") }] };
}
