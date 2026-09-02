import { createDataAccess } from "../lib/data.js";

export const name = "verification_summary";
export const description = "验证进度看板聚合：项目总进度（done/total）+ 各需求/方案对象卡片进度 + 通用横切检查项组，用于测试验收汇报";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const sum = data.verificationSummary(input.projectId);
  const lines = sum.cards.map((c) => {
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    return `- ${c.title}${c.general ? "（通用）" : `（${c.targetType === "plan" ? "方案" : "需求"}）`}: ${c.done}/${c.total}（${pct}%）${c.failNotes ? ` · 失败备注 ${c.failNotes} 条` : ""}`;
  });
  return {
    content: [{ type: "text", text: `验证总进度：${sum.done}/${sum.total}\n${lines.join("\n") || "（暂无验证项）"}` }],
  };
}
