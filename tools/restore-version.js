import { createDataAccess } from "../lib/data.js";

export const name = "restore_version";
export const description = "还原需求/方案到指定历史版本（旧内容作为新版本存入，版本链不断，可随时再还原；内容变化会再产生一版）";
export const parameters = {
  type: "object",
  required: ["projectId", "targetType", "targetId", "versionId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    targetType: { type: "string", enum: ["plan", "requirement"], description: "对象类型" },
    targetId: { type: "string", description: "对象 ID（支持短前缀）" },
    versionId: { type: "string", description: "版本 ID（list_versions 返回）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.restoreVersion(input.projectId, input.targetType, input.targetId, input.versionId);
  return { content: [{ type: "text", text: "已还原（还原内容已作为新版本保存）" }] };
}
