import { createDataAccess } from "../lib/data.js";

export const name = "update_requirement";
export const description = "编辑需求（仅待处理状态可修改：名称/简述/优先级/关联方案；已完成或已取消的需求不可修改）";
export const parameters = {
  type: "object",
  required: ["projectId", "requirementId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    requirementId: { type: "string", description: "需求 ID" },
    name: { type: "string", description: "需求名称" },
    description: { type: "string", description: "需求简述（富文本 HTML）" },
    priority: { type: "string", description: "优先级：P0-P5" },
    planIds: { type: "array", items: { type: "string" }, description: "关联方案 ID 列表（传则整体替换关联）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const req = data.updateRequirement(input.projectId, input.requirementId, {
    name: input.name,
    description: input.description,
    priority: input.priority,
    planIds: input.planIds,
  });
  return { content: [{ type: "text", text: `✅ 已更新需求「${req.name}」（${req.status}）[${req.id}]` }] };
}
