import { createDataAccess } from "../lib/data.js";

export const name = "create_member";
export const description = "新建全局成员（重名会报错）";
export const parameters = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", description: "成员名称" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const member = data.createMember(input.name);
  return { content: [{ type: "text", text: `已创建成员「${member.name}」ID: ${member.id}` }] };
}
