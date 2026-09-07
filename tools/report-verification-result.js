import { createDataAccess } from "../lib/data.js";

export const name = "report_verification_result";
export const description = "证据回填（Agent 验证专用）：Agent 执行验证指令后，回填执行证据（runner/摘要/detail）并自动勾选验证项。仅支持 kind=agent 的验证项（human 项请用 toggle_verification_item(s)；assertion 项待断言引擎）。批量逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。已勾选项重复回填为幂等更新证据（重跑场景），审计记「验证证据更新」。";
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
        required: ["id", "evidence"],
        properties: {
          id: { type: "string", description: "验证项 ID" },
          evidence: {
            type: "object",
            description: "执行证据",
            required: ["runner", "summary"],
            properties: {
              runner: { type: "string", description: "执行方标识（如 agent:common）" },
              summary: { type: "string", description: "一句话结论（如 npm test 114/114 通过）" },
              detail: { type: "string", description: "关键输出摘录（可选）" },
              runAt: { type: "string", description: "执行时间 ISO 格式（可选，默认服务端当前时间）" },
            },
          },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items 不能为空");
  if (input.items.length > 50) throw new Error("单次最多回填 50 个验证项");
  const res = data.reportVerificationResult(input.projectId, input.items.map((it) => ({
    id: it.id,
    evidence: it.evidence,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  for (const s of res.success) lines.push(`  - ${s.updated ? `[证据已更新]` : `[已勾选]`} ${s.id}`);
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
