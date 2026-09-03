import { createDataAccess } from "../lib/data.js";

export const name = "list_verification_items";
export const description = "查询某验证卡内的验证项清单（分类/内容/勾选状态），进度按项完成度计算";
export const parameters = {
  type: "object",
  required: ["projectId", "verificationId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    verificationId: { type: "string", description: "验证卡 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.listVerificationItems(input.projectId, input.verificationId);
  const lines = result.items.map((it) =>
    `- [${it.id}] (${it.status ? "✓已通过" : "未验证"}) [${it.category || "通用"}] ${it.content}${it.note ? `（备注: ${it.note}）` : ""}`
  );
  const done = result.items.filter((i) => i.status).length;
  return {
    content: [{ type: "text", text: `共 ${result.total} 项，已完成 ${done}\n${lines.join("\n") || "（空）"}` }],
  };
}
