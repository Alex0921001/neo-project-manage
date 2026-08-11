import { createDataAccess } from "../lib/data.js";

export const name = "create_project";
export const description = "创建项目";
export const parameters = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", description: "项目名称" },
    description: { type: "string", description: "描述" },
    members: { type: "array", items: { type: "string" }, description: "成员列表" },
    planStart: { type: "string", description: "计划开始日期（YYYY-MM-DD）" },
    planEnd: { type: "string", description: "计划结束日期（YYYY-MM-DD）" },
    status: { type: "string", enum: ["待开始", "进行中", "已完成", "已取消"], description: "状态，默认待开始" },
    projectSetId: { type: "string", description: "归属项目集 ID（可空）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.createProject(input);
  return { content: [{ type: "text", text: `已创建项目「${project.name}」ID: ${project.id} 状态: ${project.status}` }] };
}
