import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_delete";
export const description = "删除临时任务：未完成/已完成/已转化均可直接删（乐观同步索引）；归档数据在归档中删除（传 archivedAll=true 删除全部归档）";
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string", description: "要删除的临时任务 ID（未完成/已完成/已转化状态）" },
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
