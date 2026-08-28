import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_archive";
export const description = "归档临时任务：单条（传 id）、批量（传 ids）或归档全部已完成/已转化（传 all=true）";
export const parameters = {
  type: "object",
  properties: {
    id: { type: "string", description: "单条归档：临时任务 ID（与 ids/all 三选一）" },
    ids: { type: "array", items: { type: "string" }, description: "批量归档：临时任务 ID 列表" },
    all: { type: "boolean", description: "归档全部已完成/已转化任务（true）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (input.id) {
    const task = data.archiveQuickTask(input.id);
    return { content: [{ type: "text", text: `已归档 [ID: ${task.id}] ${task.content}` }] };
  }
  const result = data.archiveQuickTasks({ ids: input.ids, all: input.all });
  return { content: [{ type: "text", text: `已归档 ${result.archived} 条临时任务` }] };
}
