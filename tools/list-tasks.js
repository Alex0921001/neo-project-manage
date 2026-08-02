import { createDataAccess } from "../lib/data.js";

export const name = "list_tasks";
export const description = "列出项目下的任务（可按状态 / 负责人 / 关键字筛选，关键字命中任务名、描述与批注内容）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    status: { type: "string", enum: ["done", "undone", "all"], description: "筛选状态：done=已完成 / undone=未完成 / all=全部（默认 all）" },
    assignee: { type: "string", description: "筛选负责人（成员名，空=全部；匹配项目成员）" },
    keyword: { type: "string", description: "按任务名 / 描述 / 批注内容模糊搜索（可选）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const tasks = data.listTasks(input.projectId, {
    status: input.status || "all",
    assignee: input.assignee || "",
    keyword: input.keyword || "",
  });
  if (tasks.length === 0) {
    return { content: [{ type: "text", text: "暂无任务" }] };
  }
  const lines = tasks.map((t) =>
    `${t.done ? "✅" : "⬜"} ${t.name} [状态: ${t.done ? "已完成" : "未完成"}] [ID: ${t.id}]`
  );
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
