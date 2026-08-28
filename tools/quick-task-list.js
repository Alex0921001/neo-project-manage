import { createDataAccess } from "../lib/data.js";

export const name = "quick_task_list";
export const description = "查询临时任务列表（可按状态筛选、按内容模糊搜索；归档态支持分页）";
export const parameters = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["active", "done", "converted", "archived"],
      description: "按状态筛选（active=未完成 / done=已完成 / converted=已转化 / archived=已归档）；不传返回全部非归档任务",
    },
    keyword: { type: "string", description: "按内容模糊搜索（可选）" },
    page: { type: "number", description: "归档列表页码（仅 status=archived 时生效，默认 1）" },
    pageSize: { type: "number", description: "归档列表每页条数（仅 status=archived 时生效，默认 20，最大 100）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const status = input.status;
  if (status === "archived") {
    const result = data.listArchivedQuickTasks({
      page: input.page,
      pageSize: input.pageSize,
      keyword: input.keyword,
    });
    const lines = result.items.map((t) =>
      `- [${t.id}] ${t.content}（完成 ${t.doneAt ? t.doneAt.slice(0, 16).replace("T", " ") : "—"} / 归档 ${t.archivedAt ? t.archivedAt.slice(0, 16).replace("T", " ") : "—"}${t.convertedProject ? ` / 转化至 ${t.convertedProject}` : ""}）`
    );
    return {
      content: [{
        type: "text",
        text: `已归档共 ${result.total} 条（第 ${result.page}/${Math.max(1, Math.ceil(result.total / result.pageSize))} 页）\n${lines.join("\n") || "（空）"}`,
      }],
    };
  }
  let tasks = data.listQuickTasks();
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (input.keyword) {
    const kw = String(input.keyword).toLowerCase();
    tasks = tasks.filter((t) => t.content.toLowerCase().includes(kw));
  }
  if (tasks.length === 0) return { content: [{ type: "text", text: "暂无临时任务" }] };
  const statusLabel = { active: "未完成", done: "已完成", converted: "已转化" };
  const lines = tasks.map((t) => {
    const extra = t.status === "converted" && t.convertedProject ? ` → ${t.convertedProject}` : "";
    return `- [${t.id}] (${statusLabel[t.status]}${extra}) ${t.content}（创建 ${t.createdAt.slice(0, 16).replace("T", " ")}）`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
}
