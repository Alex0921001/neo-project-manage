import { createDataAccess } from "../lib/data.js";
import { parsePlanFile } from "../lib/plan-import.js";
import { createHostFs } from "../lib/host-fs.js";

export const name = "import_plan_file";
export const description = "从本地文件导入方案（txt / md / docx）。解析后返回标题与内容；autoCreate=true 时直接创建方案。非支持类型 / 超 5MB 拒绝。";
export const parameters = {
  type: "object",
  required: ["projectId", "filePath"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    filePath: { type: "string", description: "本地文件绝对路径（.txt / .md / .markdown / .docx）" },
    autoCreate: { type: "boolean", description: "是否直接创建方案（默认 false：仅返回解析结果供预览）" },
  },
};

export async function execute(input, toolCtx) {
  const filePath = String(input.filePath || "").trim();
  if (!filePath) throw new Error("缺少文件路径");

  // v2 子进程读不到工作区路径，走宿主资源通道（app/resources.read）
  const hostFs = toolCtx.hostFs || createHostFs(toolCtx.resources);
  const read = await hostFs.readBuffer(filePath);
  if (!read.ok) throw new Error(`文件读取失败：${read.error}（${filePath}）`);
  const bytes = read.bytes;
  const parsed = parsePlanFile(filePath, bytes);

  if (input.autoCreate) {
    const data = createDataAccess(toolCtx.dataDir);
    const plan = data.createPlan(input.projectId, parsed.title, parsed.content);
    return {
      content: [
        {
          type: "text",
          text: `已从文件创建方案「${plan.title}」[ID: ${plan.id}]（草稿）\n内容 ${parsed.content.length} 字符`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ title: parsed.title, content: parsed.content }, null, 2),
      },
    ],
  };
}
