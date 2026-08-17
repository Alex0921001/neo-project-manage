import { createDataAccess } from "../lib/data.js";

export const name = "update_annotations";
export const description = "批量更新批注（每项含 id + 可改字段 content/kind/confirmed）。任务已完成的便利贴冻结，冻结条目标记失败，其余成功，不做整体回滚。";
export const parameters = {
  type: "object",
  required: ["projectId", "annotations"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    annotations: {
      type: "array",
      description: "批注列表（最多 50 个），每项含 id（必填）+ content / kind / confirmed",
      items: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "批注 ID" },
          content: { type: "string", description: "批注内容" },
          kind: { type: "string", enum: ["note", "decision", "risk", "milestone"], description: "批注类型" },
          confirmed: { type: "boolean", description: "是否确认" },
        },
      },
    },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  if (!Array.isArray(input.annotations) || input.annotations.length === 0) throw new Error("annotations 不能为空");
  if (input.annotations.length > 50) throw new Error("单次最多更新 50 个批注");
  const res = data.updateAnnotations(input.projectId, input.annotations.map((a) => ({
    id: a.id,
    content: a.content,
    kind: a.kind,
    confirmed: a.confirmed,
  })));
  const lines = [`✅ 成功 ${res.success.length} 条，失败 ${res.failed.length} 条`];
  if (res.success.length) {
    lines.push("成功：");
    for (const s of res.success) lines.push(`  - [ID: ${s.id}]（任务: ${s.taskId}）`);
  }
  if (res.failed.length) {
    lines.push("失败：");
    for (const f of res.failed) lines.push(`  - [ID: ${f.id || "-"}] ${f.error}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
