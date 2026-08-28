import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_convert";
export const description = "将临时任务转为某个项目下的正式任务（事务内完成：建任务 + 标记已转化）";
export const parameters = {
  type: "object",
  required: ["id", "projectId"],
  properties: {
    id: { type: "string", description: "临时任务 ID" },
    projectId: { type: "string", description: "目标项目 ID（临时任务将作为该项目的正式任务创建）" },
    name: { type: "string", description: "正式任务名称（可选，默认沿用临时任务内容）" },
    priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4", "P5"], description: "优先级（可选，默认 P3）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { quickTask, taskId } = data.convertQuickTask(input.id, {
    projectId: input.projectId,
    name: input.name,
    priority: input.priority,
  });
  return {
    content: [{
      type: "text",
      text: `已转为正式任务 [任务ID: ${taskId}]（项目 ${quickTask.convertedProject}），原临时任务 [ID: ${quickTask.id}] 标记为已转化`,
    }],
  };
}
