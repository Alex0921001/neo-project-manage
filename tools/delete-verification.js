import { createDataAccess } from "../lib/data.js";

export const name = "delete_verification";
export const description = "删除验证项（审计记录内容快照）";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "验证项 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteVerification(input.projectId, input.id);
  return { content: [{ type: "text", text: "已删除验证项" }] };
}
