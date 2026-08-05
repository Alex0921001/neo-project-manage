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
  // 建 任务ID → 任务名 映射，用于子任务标注父任务名
  // （父任务可能被当前筛选过滤掉，故用全量列表构建，保证映射完整）
  const idToName = new Map(
    data.listTasks(input.projectId).map((t) => [t.id, t.name])
  );
  const lines = tasks.map((t) => {
    const statusText = t.done ? "已完成" : "未完成";
    const parentText =
      t.parent_task_id && idToName.has(t.parent_task_id)
        ? ` [父: ${idToName.get(t.parent_task_id)}]`
        : "";
    // 描述可能含换行，归一化为单行，保证一行一个任务（字段不被打散）
    const descText = t.description ? t.description.replace(/\s*\n+\s*/g, " ").trim() : "";
    const descPart = descText ? ` — ${descText}` : "";
    // 风格对齐 get-project.js：序号. 名称 — 描述 [状态] [父] [创建] [ID]
    return `${t.done ? "✅" : "⬜"} ${t.index_num + 1}. ${t.name}${descPart} [状态: ${statusText}]${parentText} [创建: ${t.created_at}] [ID: ${t.id}]`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
