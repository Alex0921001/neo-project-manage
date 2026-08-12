import { createDataAccess } from "../lib/data.js";

export const name = "list_members";
export const description = "列出全部全局成员（可按名称关键词过滤）";
export const parameters = {
  type: "object",
  properties: {
    keyword: { type: "string", description: "按名称模糊过滤（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const keyword = String(input.keyword || "").trim();
  const members = data.listMembers().filter((m) => !keyword || m.name.includes(keyword));
  if (members.length === 0) {
    return { content: [{ type: "text", text: keyword ? `没有名称包含「${keyword}」的成员` : "暂无成员" }] };
  }
  const lines = members.map((m) => `- ${m.name} [创建: ${m.createdAt}] [ID: ${m.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
