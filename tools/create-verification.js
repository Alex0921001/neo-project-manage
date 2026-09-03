import { createDataAccess } from "../lib/data.js";

export const name = "create_verification";
export const description = "新建验证卡（名称 + 关联任务多选 + 备注）。验证卡创建后在弹窗内补充验证项，进度按验证项完成度计算";
export const parameters = {
  type: "object",
  required: ["projectId", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "验证名称" },
    taskIds: { type: "array", items: { type: "string" }, description: "关联任务 ID 数组（可选，多选）" },
    note: { type: "string", description: "备注（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const v = data.createVerification(input.projectId, input);
  return { content: [{ type: "text", text: `已创建验证 [ID: ${v.id}] ${v.name}` }] };
}
