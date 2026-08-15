import { createDataAccess } from "../lib/data.js";

export const name = "list_requirements";
export const description = "列出项目下的需求（分页 limit/offset，可按状态 status / 关键字 keyword 筛选；含关联方案数，默认按创建时间倒序，sort=priority 时按优先级 P0→P5 升序）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "精确查找：需求 ID（填则仅返回该需求）" },
    limit: { type: "integer", description: "每页条数（默认 50，最大 100）" },
    offset: { type: "integer", description: "偏移量（默认 0）" },
    status: { type: "string", description: "按状态筛选：待处理 / 已完成 / 已取消" },
    keyword: { type: "string", description: "按名称/简述模糊搜索" },
    sort: { type: "string", description: "排序：default=创建时间倒序（默认）/ priority=优先级 P0→P5 升序，同级按创建时间倒序" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { total, items } = data.listRequirements(input.projectId, {
    id: input.id || undefined,
    limit: input.limit,
    offset: input.offset,
    status: input.status || undefined,
    keyword: input.keyword?.trim() || undefined,
    sort: input.sort || undefined,
  });
  if (items.length === 0) return { content: [{ type: "text", text: "暂无需求" }] };
  const lines = items.map((r) => {
    const mark = r.status === "已完成" ? "✅" : r.status === "已取消" ? "⛔" : "⬜";
    return `${mark} #${r.id}【${r.name}】(${r.status}) [${r.priority}]${r.planCount ? ` · 关联方案 ${r.planCount}` : ""}`;
  });
  return { content: [{ type: "text", text: [`共 ${total} 条需求`, ...lines].join("\n") }] };
}
