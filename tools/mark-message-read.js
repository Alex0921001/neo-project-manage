import { createDataAccess } from "../lib/data.js";

export const name = "mark_message_read";
export const description = "标记消息已读（批量，按消息 ID 列表；已读消息重复标记幂等）";
export const parameters = {
  type: "object",
  required: ["ids"],
  properties: {
    ids: { type: "array", items: { type: "string" }, description: "消息 ID 列表（最多 50 个）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("ids 不能为空");
  if (input.ids.length > 50) throw new Error("单次最多标记 50 条消息");
  const result = data.markMessageRead(input.ids);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
