import { createDataAccess } from "../lib/data.js";

export const name = "toggle_verification_items";
export const description = "批量勾选/退回验证项（items[].done 为目标状态，幂等：已是目标态则跳过不重复记时）。打勾即落库：写入勾选时间与操作人，并逐条写审计「验证通过/验证退回」。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。";
export const parameters = {
  type: "object",
  required: ["projectId", "items"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    items: {
      type: "array",
      description: "验证项列表（最多 50 个）",
      items: {
        type: "object",
        required: ["id", "done"],
        properties: {
          id: { type: "string", description: "验证项 ID" },
          done: { type: "boolean", description: "目标状态：true=勾选通过，false=退回" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多操作 50 个验证项");
  const res = data.toggleVerificationItems(input.projectId, input.items.map((it) => ({
    id: it.id,
    done: it.done,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    const passed = res.success.filter((s) => s.status).length;
    const returned = res.success.length - passed;
    lines.push(`勾选通过 ${passed} 条，退回 ${returned} 条`);
    for (const s of res.success) lines.push(`  - [${s.status ? "✓" : "✗"}] ${s.id}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
