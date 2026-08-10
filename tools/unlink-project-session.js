import { createDataAccess } from "../lib/data.js";

export const name = "unlink_project_session";
export const description = "解除项目与会话的关联（会话不存在则原样返回）";
export const parameters = {
  type: "object",
  required: ["projectId", "sessionId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    sessionId: { type: "string", description: "Hana 会话 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const sessions = data.unlinkProjectSession(input.projectId, input.sessionId);
  return {
    content: [{ type: "text", text: `已解除会话 ${input.sessionId} 与项目 ${input.projectId} 的关联（剩余 ${sessions.length} 个关联会话）` }],
  };
}
