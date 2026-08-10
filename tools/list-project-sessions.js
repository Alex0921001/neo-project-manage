import { createDataAccess } from "../lib/data.js";

export const name = "list_project_sessions";
export const description = "列出项目关联的会话 ID 列表";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const sessions = data.listProjectSessions(input.projectId);
  const text = sessions.length
    ? sessions.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "暂无关联会话";
  return { content: [{ type: "text", text }] };
}
