import { createDataAccess } from "../lib/data.js";

export const name = "create_verification";
export const description = "新增验证项（一句话检查项）。可挂需求/方案（targetType+targetId），不挂则为项目通用横切检查项；创建/勾选/删除均写审计";
export const parameters = {
  type: "object",
  required: ["projectId", "content"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    content: { type: "string", description: "验证内容（一句话检查项）" },
    targetType: { type: "string", enum: ["plan", "requirement"], description: "挂载对象类型（可选，不挂=通用检查项）" },
    targetId: { type: "string", description: "挂载对象 ID（可选，支持短前缀）" },
    category: { type: "string", description: "测试分类（可选，如 功能验证 / 边界与异常 / 回归验证）" },
    note: { type: "string", description: "备注（可选，如失败原因）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const item = data.createVerification(input.projectId, input);
  return { content: [{ type: "text", text: `已创建验证项 [ID: ${item.id}]（${item.category || "通用"}）` }] };
}
