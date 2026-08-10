import { createDataAccess } from "../lib/data.js";

export const name = "link_project_session";
export const description = "关联会话到项目（绑定项目与会话，重复关联自动去重）";
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
  const sessions = data.linkProjectSession(input.projectId, input.sessionId);
  return {
    content: [{ type: "text", text: `已关联会话 ${input.sessionId} 到项目 ${input.projectId}（当前 ${sessions.length} 个关联会话）` }],
  };
}
