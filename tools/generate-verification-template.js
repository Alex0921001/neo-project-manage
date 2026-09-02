import { createDataAccess } from "../lib/data.js";

export const name = "generate_verification_template";
export const description = "按模板批量生成验证项（已填类别的空检查项，内容待补）。模板：standard=标准三件套（功能验证/边界与异常/回归验证）、ui=UI 走查、compat=兼容性";
export const parameters = {
  type: "object",
  required: ["projectId", "templateKey"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    templateKey: { type: "string", enum: ["standard", "ui", "compat"], description: "模板 key" },
    targetType: { type: "string", enum: ["plan", "requirement"], description: "挂载对象类型（可选，不挂=通用检查项）" },
    targetId: { type: "string", description: "挂载对象 ID（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const created = data.generateFromTemplate(input.projectId, input);
  const lines = created.map((v) => `- [${v.id}] (${v.category}) ${v.content}`);
  return { content: [{ type: "text", text: `已生成 ${created.length} 条空检查项，请逐条补充验证内容：\n${lines.join("\n")}` }] };
}
