import { createDataAccess } from "../lib/data.js";

export const name = "list_audit_logs";
export const description = "列出项目审计日志（按时间倒序，可筛选动作/关键词，分页）";
export const parameters = {
  type: "object",
  required: ["projectId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    limit: { type: "integer", description: "条数上限（默认 50，最大 200）" },
    action: { type: "string", description: "按动作名精确筛选（如「更新任务」「删除批注」「归档项目」）" },
    keyword: { type: "string", description: "按动作/目标/变更内容关键词模糊筛选" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const project = data.getProject(input.projectId);
  if (!project) throw new Error(`项目 ${input.projectId} 不存在`);

  const { items, total } = data.listAuditLogs(input.projectId, {
    limit: input.limit,
    action: input.action,
    keyword: input.keyword,
  });

  if (items.length === 0) {
    return { content: [{ type: "text", text: `项目「${project.name}」暂无审计记录` }] };
  }

  const lines = [
    `📋 项目「${project.name}」审计日志（共 ${total} 条，展示 ${items.length} 条）`,
    "",
  ];
  // 注意：不能用 .map(shortValue) 直接传引用，map 会把 index 当作第二个参数（max）传入
  for (const l of items) {
    const diff = [l.oldValue, l.newValue].filter(Boolean).map((v) => shortValue(v)).join(" → ");
    lines.push(`- ${fmtTime(l.createdAt)} [${l.action}] ${targetLabel(l, project)}${diff ? ` | ${diff}` : ""}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** ISO 时间 → MM-DD HH:mm（本地时区） */
function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 目标类型中文名 + 目标名（从 old/new JSON 提取 name/content） */
const TYPE_LABEL = {
  project: "项目",
  task: "任务",
  annotation: "批注",
  file: "文件",
  note: "备注",
  member: "成员",
  project_set: "项目集",
};

function targetLabel(l, project) {
  const label = TYPE_LABEL[l.targetType] || l.targetType;
  const name = extractName(l) || lookupName(project, l);
  return name ? `${label}「${name}」` : `${label} ${l.targetId || ""}`;
}

function extractName(l) {
  for (const raw of [l.newValue, l.oldValue]) {
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === "object") {
        if (j.name) return shortValue(j.name);
        if (j.content) return shortValue(j.content);
      }
    } catch { /* 非 JSON 原文跳过 */ }
  }
  return "";
}

/** 递归找任务树节点 */
function findTask(tasks, id) {
  for (const t of tasks || []) {
    if (t.id === id) return t;
    const hit = findTask(t.subtasks || [], id);
    if (hit) return hit;
  }
  return null;
}

/** 从项目详情反查目标名（变更字段不含 name 时的兜底，如只改状态） */
function lookupName(project, l) {
  if (!project) return "";
  if (l.targetType === "project") return project.name || "";
  if (l.targetType === "task") return findTask(project.tasks || [], l.targetId)?.name || "";
  if (l.targetType === "annotation") {
    const stack = [...(project.tasks || [])];
    while (stack.length) {
      const t = stack.pop();
      const hit = (t.annotations || []).find((a) => a.id === l.targetId);
      if (hit) return shortValue(hit.content);
      stack.push(...(t.subtasks || []));
    }
    return "";
  }
  if (l.targetType === "file") return (project.files || []).find((f) => f.id === l.targetId)?.name || "";
  if (l.targetType === "note") return (project.notes || []).find((n) => n.id === l.targetId)?.content || "";
  return "";
}

/** 值展示：JSON 压缩 + 截断（默认 80 字符） */
function shortValue(v, max = 80) {
  if (v === null || v === undefined) return "";
  let s;
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      if (j && typeof j === "object") s = JSON.stringify(j);
      else s = v;
    } catch {
      s = v;
    }
  } else {
    s = JSON.stringify(v);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
