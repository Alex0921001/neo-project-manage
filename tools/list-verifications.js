import { createDataAccess } from "../lib/data.js";

export const name = "list_verifications";
export const description = "查询验证项清单（一句话检查项 + 两态勾选）。不传过滤条件返回项目全部；通用横切检查项 targetType/targetId 为空";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    targetType: { type: "string", enum: ["plan", "requirement"], description: "按对象类型过滤（可选）" },
    targetId: { type: "string", description: "按对象 ID 过滤（可选，支持短前缀）" },
    category: { type: "string", description: "按分类过滤（可选，如 功能验证/回归验证）" },
    status: { type: "string", enum: ["done", "undone"], description: "按状态过滤（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.listVerifications(input.projectId, {
    targetType: input.targetType,
    targetId: input.targetId,
    category: input.category,
    status: input.status === "done" ? true : input.status === "undone" ? false : undefined,
  });
  const lines = result.items.map((v) =>
    `- [${v.id}] (${v.status ? "✓已通过" : "未验证"}) [${v.category || "通用"}] ${v.content}${v.note ? `（备注: ${v.note}）` : ""}`
  );
  return { content: [{ type: "text", text: `共 ${result.total} 条\n${lines.join("\n") || "（空）"}` }] };
}
