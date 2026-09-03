import { createDataAccess } from "../lib/data.js";

export const name = "list_verifications";
export const description = "查询验证卡列表（分页 20/页，含关联任务与完成进度）。验证 = 一组验证项的集合，进度按卡内验证项完成度计算";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    page: { type: "number", description: "页码（默认 1）" },
    pageSize: { type: "number", description: "每页条数（默认 20，最大 100）" },
    keyword: { type: "string", description: "按名称/备注模糊搜索（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.listVerifications(input.projectId, {
    page: input.page,
    pageSize: input.pageSize,
    keyword: input.keyword,
  });
  const lines = result.items.map((v) => {
    const tasks = v.taskNames.map((t) => t.name).join("、") || "无关联任务";
    return `- [${v.id}] ${v.name}（进度 ${v.progress.done}/${v.progress.total} · 关联任务: ${tasks}）${v.note ? ` 备注: ${v.note}` : ""}`;
  });
  return {
    content: [{ type: "text", text: `共 ${result.total} 条（第 ${result.page} 页）\n${lines.join("\n") || "（空）"}` }],
  };
}
