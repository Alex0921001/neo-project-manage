import { createDataAccess } from "../lib/data.js";

export const name = "delete_message";
export const description = "删除单条消息（消息中心清理；已删除消息报错）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "消息 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const id = String(input.id || "").trim();
  if (!id) throw new Error("id 不能为空");
  const result = data.deleteMessage(id);
  return { content: [{ type: "text", text: JSON.stringify({ ok: result }, null, 2) }] };
}
