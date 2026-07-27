import { createDataAccess } from "../lib/data.js";

export const name = "update_project";
export const description = "编辑项目信息（名称、描述、成员、时间、状态、归属项目集）";
export const parameters = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", description: "项目 ID" },
    name: { type: "string", description: "项目名称" },
    description: { type: "string", description: "描述" },
    members: { type: "array", items: { type: "string" }, description: "成员列表" },
    planStart: { type: "string", description: "计划开始日期（YYYY-MM-DD）" },
    planEnd: { type: "string", description: "计划结束日期（YYYY-MM-DD）" },
    status: { type: "string", enum: ["待开始", "进行中", "已完成"], description: "状态" },
    projectSetId: { type: "string", description: "归属项目集 ID（空字符串表示未归类）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.updateProject(input.id, input);
  if (!project) throw new Error(`项目 ${input.id} 不存在`);
  return { content: [{ type: "text", text: `已更新项目「${project.name}」状态: ${project.status}` }] };
}
