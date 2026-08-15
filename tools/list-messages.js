import { createDataAccess } from "../lib/data.js";

export const name = "list_messages";
export const description = "列出消息中心消息（先惰性扫描生成新消息，再分页；可按项目/类型筛选，含未读数 unread 与 read 标记）";
export const parameters = {
  type: "object",
  required: [],
  properties: {
    projectId: { type: "string", description: "项目 ID（可选，不传=全部项目）" },
    type: { type: "string", description: "消息类型筛选：deadline（到期提醒）/ risk（风险提醒）/ synergy（协同通知，预留）（可选）" },
    limit: { type: "integer", description: "每页条数（默认 20，最大 100）" },
    offset: { type: "integer", description: "偏移量（默认 0，配合 limit 翻页）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const projectId = input.projectId || undefined;
  const type = input.type || undefined;
  if (projectId) {
    const project = data.getProject(projectId);
    if (!project) throw new Error(`项目 ${projectId} 不存在`);
  }
  if (type && !["deadline", "risk", "synergy"].includes(type)) {
    throw new Error(`type 仅支持 deadline/risk/synergy，收到「${type}」`);
  }
  const result = data.listMessages({ projectId, type, limit: input.limit, offset: input.offset });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
