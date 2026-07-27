import { createDataAccess } from "../lib/data.js";

export const name = "list_project_sets";
export const description = "列出所有项目集（含各集下项目数量）";
export const parameters = {
  type: "object",
  properties: {},
};

export async function execute(_input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const sets = data.listProjectSetsWithCounts();
  if (sets.length === 0) {
    return { content: [{ type: "text", text: "暂无项目集" }] };
  }
  const lines = sets.map((s) => `- ${s.name}（${s.projectCount} 个项目）[ID: ${s.id}]`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
