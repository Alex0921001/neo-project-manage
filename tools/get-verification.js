import { createDataAccess } from "../lib/data.js";

export const name = "get_verification";
export const description = "按 ID 查询单张验证卡详情（无需 projectId，支持完整 ID 或唯一短前缀全局解析；关联任务/方案/进度一并返回）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "验证卡 ID（完整 ID 或唯一短前缀）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const v = data.getVerificationGlobal(input.id);
  if (!v) return { content: [{ type: "text", text: `验证卡 ${input.id} 不存在` }] };
  const tasks = v.taskNames.map((t) => `${t.name}${t.done ? "（已完成）" : ""}`).join("、") || "无关联任务";
  const plans = v.planNames.map((p) => p.name).join("、") || "无关联方案";
  return {
    content: [{
      type: "text",
      text: `验证卡 [ID: ${v.id}]（所属项目：${v.projectName} [${v.projectId}]）\n名称：${v.name}\n备注：${v.note || "无"}\n关联任务：${tasks}\n关联方案：${plans}\n进度：${v.progress.done}/${v.progress.total}`,
    }],
  };
}
