import { createDataAccess } from "../lib/data.js";

export const name = "create_requirement";
export const description = "新建需求（项目级，状态默认待处理；可选关联方案 planIds 多对多挂载）";
export const parameters = {
  type: "object",
  required: ["projectId", "name"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "需求名称（最多 50 字）" },
    description: { type: "string", description: "需求简述（富文本 HTML）" },
    priority: { type: "string", description: "优先级：P0-P5（默认 P3）" },
    planIds: { type: "array", items: { type: "string" }, description: "关联方案 ID 列表（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const req = data.createRequirement(input.projectId, {
    name: input.name,
    description: input.description,
    priority: input.priority,
    planIds: input.planIds,
  });
  return {
    content: [{
      type: "text",
      text: `✅ 已创建需求「${req.name}」（${req.status}）[${req.id}]${req.plans.length ? `，关联方案 ${req.plans.length} 个` : ""}`,
    }],
  };
}
