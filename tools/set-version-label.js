import { createDataAccess } from "../lib/data.js";

export const name = "set_version_label";
export const description = "给版本快照补备注（「标记重要」，最长 60 字；传空清除）";
export const parameters = {
  type: "object",
  required: ["projectId", "versionId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    versionId: { type: "string", description: "版本 ID（list_versions 返回）" },
    label: { type: "string", description: "备注文本（可选，传空清除）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  data.setVersionLabel(input.projectId, input.versionId, input.label ?? null);
  return { content: [{ type: "text", text: "已更新版本备注" }] };
}
