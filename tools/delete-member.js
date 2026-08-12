import { createDataAccess } from "../lib/data.js";

export const name = "delete_member";
export const description = "删除成员（仅删除全局名录，不影响历史项目/任务中已引用的名字）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "成员 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.deleteMember(input.id);
  return { content: [{ type: "text", text: "已删除成员" }] };
}
