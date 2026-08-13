import { createDataAccess } from "../lib/data.js";

export const name = "confirm_annotations";
export const description = "批量确认批注（便利贴）。范围：ids 指定批注，或 taskId 该任务全部未确认，或 projectId 项目全部未确认；事务 + 已完成任务冻结校验，任一失败整体回滚。解决任务完成前置校验（全部便利贴须已确认）逐个确认的痛点。";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    taskId: { type: "string", description: "任务 ID（可选：确认该任务全部未确认批注）" },
    ids: { type: "array", items: { type: "string" }, maxItems: 50, description: "批注 ID 列表（可选，优先于 taskId）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const res = data.confirmAnnotations(input.projectId, {
    taskId: input.taskId || "",
    ids: input.ids || [],
  });
  const lines = [`✅ 已批量确认 ${res.count} 条批注`];
  if (res.count === 0) lines.push("（范围内没有待确认批注）");
  else lines.push(`批注 ID: ${res.confirmed.join(", ")}`);
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
