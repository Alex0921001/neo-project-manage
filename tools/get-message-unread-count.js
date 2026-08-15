import { createDataAccess } from "../lib/data.js";

export const name = "get_message_unread_count";
export const description = "获取消息中心未读数（先惰性扫描保证新鲜；可按项目过滤，不传=全部项目）";
export const parameters = {
  type: "object",
  required: [],
  properties: {
    projectId: { type: "string", description: "项目 ID（可选，不传=全部项目）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const projectId = input.projectId || undefined;
  if (projectId) {
    const project = data.getProject(projectId);
    if (!project) throw new Error(`项目 ${projectId} 不存在`);
  }
  const unread = data.getMessageUnreadCount(projectId);
  return { content: [{ type: "text", text: JSON.stringify({ unread }, null, 2) }] };
}
