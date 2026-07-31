import { createDataAccess } from "../lib/data.js";

export const name = "delete_tasks";
export const description = "批量删除任务（删除父任务会级联删除其所有子任务）";
export const parameters = {
  type: "object",
  required: ["projectId", "taskIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    taskIds: {
      type: "array",
      description: "要删除的任务 ID 列表（最多 50 个）",
      items: { type: "string", description: "任务 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.taskIds) || input.taskIds.length === 0) throw new Error("taskIds 不能为空");
  if (input.taskIds.length > 50) throw new Error("单次最多删除 50 个任务");
  // 先整体校验：任务存在且属于该项目，避免部分删除
  const proj = data.getProject(input.projectId);
  if (!proj) throw new Error(`项目 ${input.projectId} 不存在`);
  const ids = new Set();
  const walk = (tasks) => {
    for (const t of tasks || []) {
      ids.add(t.id);
      walk(t.subtasks);
    }
  };
  walk(proj.tasks);
  for (const id of input.taskIds) {
    if (!ids.has(id)) throw new Error(`任务 ${id} 不存在或不属于该项目`);
  }
  for (const id of input.taskIds) data.deleteTask(input.projectId, id);
  return { content: [{ type: "text", text: `已批量删除 ${input.taskIds.length} 个任务（含级联删除的子任务）` }] };
}
