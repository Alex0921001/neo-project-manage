import { createDataAccess } from "../lib/data.js";

export const name = "toggle_verification";
export const description = "勾选/退回验证项（两态切换，打勾即落库：写入勾选时间与操作人，并写审计「验证通过/验证退回」）";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "验证项 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const item = data.toggleVerification(input.projectId, input.id);
  return {
    content: [{ type: "text", text: item.status ? `验证项 [${item.id}] 已标记通过（${item.checkedAt.slice(0, 16).replace("T", " ")}）` : `验证项 [${item.id}] 已退回为未验证` }],
  };
}
