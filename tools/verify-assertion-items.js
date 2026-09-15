import { createDataAccess } from "../lib/data.js";

export const name = "verify_assertion_items";
export const description = "批量执行数据断言验证项（kind=assertion，最多 50 个）：后端按验证项 instruction 中的四元组 JSON（{target:\"表名:id\", field, op, value}）查库断言。逐条独立：单条失败不影响其他条，返回成功/失败清单及原因。断言通过自动勾选并回填证据（runner: assertion）；失败/结构无效（JSON 解析失败、白名单外表名、非法操作符）拒勾并返回原因。目标表白名单：projects/tasks/plans/requirements/comments/verifications/verification_items/quick_tasks/annotations/notes/files/versions。";
export const parameters = {
  type: "object",
  required: ["projectId", "ids"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    ids: {
      type: "array",
      description: "断言验证项 ID 列表（最多 50 个，kind 必须为 assertion）",
      items: { type: "string" },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw new Error("ids 不能为空");
  if (input.ids.length > 50) throw new Error("单次最多执行 50 个断言项");
  const res = data.verifyAssertionItems(input.projectId, input.ids);
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  for (const s of res.success) {
    lines.push(`  - ${s.updated ? "[证据已更新]" : "[已勾选]"} ${s.id} · ${s.summary}`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
