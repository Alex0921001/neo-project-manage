import { createDataAccess } from "../lib/data.js";

export const name = "list_requirements";
export const description = "列出项目下的需求（分页 limit/offset，可按状态 status / 关键字 keyword 筛选；含关联方案数，按创建时间倒序）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    limit: { type: "integer", description: "每页条数（默认 50，最大 100）" },
    offset: { type: "integer", description: "偏移量（默认 0）" },
    status: { type: "string", description: "按状态筛选：待处理 / 已完成 / 已取消" },
    keyword: { type: "string", description: "按名称/简述模糊搜索" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { total, items } = data.listRequirements(input.projectId, {
    limit: input.limit,
    offset: input.offset,
    status: input.status || undefined,
    keyword: input.keyword?.trim() || undefined,
  });
  if (items.length === 0) return { content: [{ type: "text", text: "暂无需求" }] };
  const lines = items.map((r) => {
    const mark = r.status === "已完成" ? "✅" : r.status === "已取消" ? "⛔" : "⬜";
    return `${mark} #${r.id.slice(0, 4)}【${r.name}】(${r.status}) [${r.priority}]${r.planCount ? ` · 关联方案 ${r.planCount}` : ""}`;
  });
  return { content: [{ type: "text", text: [`共 ${total} 条需求`, ...lines].join("\n") }] };
}
