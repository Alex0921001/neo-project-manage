import { createDataAccess } from "../lib/data.js";

export const name = "update_verification";
export const description = "编辑验证卡（名称/关联任务/备注，传哪个改哪个），全量审计";
export const parameters = {
  type: "object",
  required: ["projectId", "id"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    id: { type: "string", description: "验证卡 ID" },
    name: { type: "string", description: "新的验证名称（可选）" },
    taskIds: { type: "array", items: { type: "string" }, description: "关联任务 ID 数组（可选，全量替换）" },
    note: { type: "string", description: "备注（可选，传空串清除）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const { projectId, id, ...patch } = input;
  const v = data.updateVerification(projectId, id, patch);
  return { content: [{ type: "text", text: `已更新验证 [ID: ${v.id}]` }] };
}
