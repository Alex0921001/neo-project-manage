import { createDataAccess } from "../lib/data.js";

export const name = "search_all";
export const description = "全类型全文检索：项目/任务/批注/方案/需求/备注 + 文件名统一搜。中文 3 字以上走 FTS5（trigram + bm25 排序 + <mark> 高亮 snippet），1~2 字走 LIKE 兜底。返回 {indexed, total, results}。";
export const parameters = {
  type: "object",
  required: ["keyword"],
  properties: {
    keyword: { type: "string", description: "搜索关键词（空字符串返回空结果，不报错）" },
    projectId: { type: "string", description: "限定项目 ID（可选，不传=全部项目）" },
    type: { type: "string", description: "限定类型：project / task / annotation / plan / requirement / note / file（可选）" },
    limit: { type: "integer", description: "结果条数上限（默认 20，最大 100）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const projectId = input.projectId || undefined;
  const type = input.type || undefined;
  if (projectId) {
    const project = data.getProject(projectId);
    if (!project) throw new Error(`项目 ${projectId} 不存在`);
  }
  if (type && !["project", "task", "annotation", "plan", "requirement", "note", "file"].includes(type)) {
    throw new Error(`type 仅支持 project/task/annotation/plan/requirement/note/file，收到「${type}」`);
  }
  const result = data.searchAll(input.keyword, { projectId, type, limit: input.limit });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
