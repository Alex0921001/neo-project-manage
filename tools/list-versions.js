import { createDataAccess } from "../lib/data.js";

export const name = "list_versions";
export const description = "查询需求/方案的版本快照列表（新→旧，含内容）。每次保存内容实际变化时自动存版，保留最近 50 版";
export const parameters = {
  type: "object",
  required: ["projectId", "targetType", "targetId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    targetType: { type: "string", enum: ["plan", "requirement"], description: "对象类型" },
    targetId: { type: "string", description: "对象 ID（支持短前缀）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const result = data.listVersions(input.projectId, input.targetType, input.targetId);
  const lines = result.items.map((v) =>
    `- v${v.versionNo} [${v.id}] ${v.createdAt.slice(0, 16).replace("T", " ")}「${v.title}」${v.label ? `（${v.label}）` : ""} 内容 ${v.content.length} 字`
  );
  return { content: [{ type: "text", text: `共 ${result.total} 版\n${lines.join("\n") || "（暂无版本）"}` }] };
}
