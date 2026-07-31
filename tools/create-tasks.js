import { createDataAccess } from "../lib/data.js";

export const name = "create_tasks";
export const description = "批量生成任务（一次创建多个任务，可指定父任务）";
export const parameters = {
  type: "object",
  required: ["projectId", "tasks"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    tasks: {
      type: "array",
      description: "任务列表（最多 50 个），每项含 name（必填）、description（可选）、parentTaskId（可选）",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "任务名称" },
          description: { type: "string", description: "简述" },
          parentTaskId: { type: "string", description: "父任务 ID（不填则为顶层任务）" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error("tasks 不能为空");
  if (input.tasks.length > 50) throw new Error("单次最多创建 50 个任务");
  // 先整体校验名称，避免中途失败
  for (const [i, t] of input.tasks.entries()) {
    if (!t.name || !t.name.trim()) throw new Error(`第 ${i + 1} 个任务缺少名称`);
  }
  const created = [];
  for (const t of input.tasks) {
    created.push(data.createTask(input.projectId, {
      name: t.name.trim(),
      description: t.description,
      parentTaskId: t.parentTaskId,
    }));
  }
  const lines = created.map((t) =>
    `- ${t.name} [ID: ${t.id}]${t.parent_task_id ? `（父任务: ${t.parent_task_id}）` : "（顶层）"}`
  );
  return { content: [{ type: "text", text: `已批量创建 ${created.length} 个任务：\n${lines.join("\n")}` }] };
}
