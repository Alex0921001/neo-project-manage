import { createDataAccess } from "../lib/data.js";

export const name = "update_member";
export const description = "编辑成员名称（重名会报错）";
export const parameters = {
  type: "object",
  required: ["id", "name"],
  properties: {
    id: { type: "string", description: "成员 ID" },
    name: { type: "string", description: "新的成员名称" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const member = data.renameMember(input.id, input.name);
  return { content: [{ type: "text", text: `已更新成员「${member.name}」ID: ${member.id}` }] };
}
