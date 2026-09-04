import { createDataAccess } from "../lib/data.js";

export const name = "delete_verifications";
export const description = "批量删除验证卡（卡内验证项级联删除，删除留审计）。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "verificationIds"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    verificationIds: {
      type: "array",
      description: "要删除的验证卡 ID 列表（最多 50 个）",
      items: { type: "string", description: "验证卡 ID" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.verificationIds) || input.verificationIds.length === 0) throw new Error("verificationIds 不能为空");
  if (input.verificationIds.length > 50) throw new Error("单次最多删除 50 个验证卡");
  const res = data.deleteVerifications(input.projectId, input.verificationIds);
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push(`已删除：${res.success.map((s) => s.id).join("、")}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
