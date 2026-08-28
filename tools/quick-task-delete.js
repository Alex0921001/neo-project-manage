import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_delete";
export const description = "删除临时任务：未完成草稿可直接删；归档数据可在归档中删除（传 archivedAll=true 删除全部归档）；已完成/已转化不可直接删除";
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string", description: "要删除的临时任务 ID（未完成草稿或归档数据）" },
    archivedAll: { type: "boolean", description: "删除全部归档数据（true，仅限已归档状态）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (input.archivedAll) {
    const result = data.deleteArchivedQuickTasks({ all: true });
    return { content: [{ type: "text", text: `已删除全部归档数据（${result.deleted} 条）` }] };
  }
  if (!input.id) throw new Error("请指定 id 或 archivedAll=true");
  data.deleteQuickTask(input.id);
  return { content: [{ type: "text", text: `已删除临时任务 [ID: ${input.id}]` }] };
}
