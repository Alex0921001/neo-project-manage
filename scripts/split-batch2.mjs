// 批2切割：14 个大域模块。关键升级：
// 1) deps 自动检测：初始共享 → 解构；跨模块函数 → 转发箭头（运行时解引用，顺序无关、环安全）
// 2) 共享工具函数（normalizeDate/htmlToPlain 等 7 个）从区块剥离保留在 data.js 闭包
// 3) 保留导出 return 对象原文
import fs from "fs";
import path from "path";

const FILE = "lib/data.js";
const lines = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n").split("\n");

// ---- 常量 ----
const SHARED = new Set(["db","shortId","escapeLike","htmlToPlain","truncateText","sanitizeHtml","richTextEmpty",
  "normalizeDate","localToday","localNowIso","addDays","diffDays","parseAssignees","parseMembers","parseSessionIds","computeStatus","normalizeMembers"]);
const EXTRACT = ["normalizeDate","htmlToPlain","truncateText","localToday","localNowIso","addDays","diffDays"]; // 从区块剥离保留闭包
const CTX_BASE = ["db","shortId","escapeLike","htmlToPlain","truncateText","sanitizeHtml","richTextEmpty",
  "normalizeDate","localToday","localNowIso","addDays","diffDays","parseAssignees","parseMembers","parseSessionIds","computeStatus","normalizeMembers",
  "buildTaskTree","getTaskPlanRefsMap","getTaskFileRefsMap","getTaskAnnotationsMap","getProjectTasks","getProjectFull","getProjectStats","collectDescendantIds","countIncompleteDescendants"];

const MODULES = [
  { title: ["status 计算"], file: "core.js", fn: "createCoreModule", custom: "core" },
  { title: ["全文检索"], file: "fts.js", fn: "createFtsModule" },
  { title: ["审计日志"], file: "audit.js", fn: "createAuditModule" },
  { title: ["Project Sets"], file: "project-sets.js", fn: "createProjectSetsModule" },
  { title: ["Tasks", "旧版 SubTask API 兼容"], file: "tasks.js", fn: "createTasksModule", extra: `  const PRIORITY_LEVELS = ["P0", "P1", "P2", "P3", "P4", "P5"];` },
  { title: ["Annotations"], file: "annotations.js", fn: "createAnnotationsModule" },
  { title: ["Projects", "项目总结持久化"], file: "projects.js", fn: "createProjectsModule" },
  { title: ["Files", "Folders"], file: "files.js", fn: "createFilesModule" },
  { title: ["方案管理", "方案↔需求反向挂载", "方案↔任务反向挂载"], file: "plans.js", fn: "createPlansModule" },
  { title: ["版本管理"], file: "versions.js", fn: "createVersionsModule" },
  { title: ["验证模块", "验证分类字典"], file: "verifications.js", fn: "createVerificationsModule" },
  { title: ["统一评论"], file: "comments.js", fn: "createCommentsModule" },
  { title: ["Requirements"], file: "requirements.js", fn: "createRequirementsModule" },
  { title: ["项目总结与风险识别", "项目级问答编排"], file: "insights.js", fn: "createInsightsModule" },
];

// ---- marks 与已知函数 ----
const marks = [];
lines.forEach((l, i) => {
  const m = l.match(/^\s*\/\/ =====\s*(.+?)\s*=+\s*$/);
  if (m) marks.push({ line: i, title: m[1] });
});
const allFns = new Set(lines.map((l) => (l.match(/^  function (\w+)/) || [])[1]).filter(Boolean));

// ---- 函数体剥离（括号深度定界）----
function extractFn(blockLines, name) {
  const out = [];
  const kept = [];
  let i = 0;
  while (i < blockLines.length) {
    if (new RegExp(`^  function ${name}\\(`).test(blockLines[i])) {
      let depth = 0, started = false;
      const fnLines = [];
      while (i < blockLines.length) {
        const l = blockLines[i];
        depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
        if (l.includes("{")) started = true;
        fnLines.push(l);
        i++;
        if (started && depth === 0) break;
      }
      out.push(...fnLines);
    } else { kept.push(blockLines[i]); i++; }
  }
  return { kept, fnLines: out };
}

// ---- 定位区块 ----
function findBlock(prefix) {
  const mi = marks.findIndex((m) => m.title.startsWith(prefix));
  if (mi < 0) throw new Error("区块未找到: " + prefix);
  const start = marks[mi].line;
  const end = (mi + 1 < marks.length ? marks[mi + 1].line : lines.length) - 1;
  return { start, end };
}

// ---- 逐模块切割 ----
const cuts = [];
const made = [];
fs.mkdirSync("lib/domain", { recursive: true });
const extractedShared = [];

for (const mod of MODULES) {
  let ranges;
  if (mod.custom === "core") {
    // core 特殊：只要闭包内的 healDanglingReferences/resolveRowById（顶层定义与 createDataAccess 开头留在 data.js）
    const healIdx = lines.findIndex((l) => l.startsWith("  function healDanglingReferences"));
    const auditMi = marks.findIndex((m) => m.title.startsWith("审计日志"));
    if (healIdx < 0 || auditMi < 0) throw new Error("core 锚点未找到");
    let st = healIdx;
    while (st > 0 && lines[st - 1].trim().startsWith("//")) st--; // 吞紧邻注释
    ranges = [{ start: st, end: marks[auditMi].line - 1 }];
  } else {
    ranges = mod.title.map((t) => findBlock(t));
  }
  let blockLines = [];
  for (const r of ranges) {
    if (blockLines.length) blockLines.push("");
    blockLines.push(...lines.slice(r.start, r.end + 1));
  }
  // 剥离共享工具
  for (const fn of EXTRACT) {
    if (mod.file === "tasks.js" && fn === "normalizeDate" || mod.file === "insights.js" && fn !== "normalizeDate") {
      const r = extractFn(blockLines, fn);
      if (r.fnLines.length) { extractedShared.push(...r.fnLines, ""); blockLines = r.kept; }
    }
  }
  const text = blockLines.join("\n");
  const blockFns = [...new Set(blockLines.map((l) => (l.match(/^  function (\w+)/) || [])[1]).filter(Boolean))];
  // deps：SHARED → 解构；其他已知函数（非本模块）→ 转发
  const destruct = new Set(), forward = new Set();
  for (const s of SHARED) if (new RegExp("\\b" + s + "\\b").test(text)) destruct.add(s);
  for (const f of allFns) {
    if (blockFns.includes(f) || SHARED.has(f)) continue;
    if (new RegExp("\\b" + f + "\\s*\\(").test(text)) forward.add(f);
  }
  const header = `// ${mod.title[0]}（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）\n` +
    `// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import\n` +
    `export function ${mod.fn}(ctx) {\n` +
    (destruct.size ? `  const { ${[...destruct].join(", ")} } = ctx;\n` : "") +
    (forward.size ? [...forward].map((f) => `  const ${f} = (...a) => ctx.${f}(...a);`).join("\n") + "\n" : "") +
    (mod.extra ? mod.extra + "\n" : "");
  const src = header + blockLines.join("\n") + `\n  return {\n    ${blockFns.join(",\n    ")},\n  };\n}\n`;
  fs.writeFileSync(path.join("lib/domain", mod.file), src, "utf8");
  made.push({ mod, blockFns });
  for (const r of ranges) cuts.push([r.start, r.end]);
  console.log(`${mod.file}: ${ranges.map((r) => `L${r.start + 1}~L${r.end + 1}`).join("+")} (${blockLines.length} 行, ${blockFns.length} 函数, 解构${destruct.size} 转发${forward.size})`);
}

// ---- data.js 重组：初始行号打标 + 一次性过滤（无漂移）----
const del = new Set();
for (const [s, e] of cuts) {
  if (s > 0 && lines[s - 1].trim() === "") del.add(s - 1);
  for (let k = s; k <= e; k++) del.add(k);
}
// 旧组装块定位：标记行与导出 return（初始行号）
let markIdx = -1, retIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes("低耦合域模块组装")) { markIdx = i; break; }
}
if (markIdx < 0) throw new Error("旧组装块未找到");
for (let i = markIdx; i < lines.length; i++) {
  if (lines[i] === "  return {") { retIdx = i; break; }
}
if (retIdx < 0) throw new Error("导出 return 未找到");
// 组装块头部删除，导出对象保留
for (let k = markIdx; k < retIdx; k++) del.add(k);
const kept = lines.filter((l, i) => !del.has(i));
const keptRet = kept.findIndex((l) => l === "  return {");
if (keptRet < 0) throw new Error("kept 中未找到导出 return");
// 批1模块函数也纳入解构（导出对象引用全部模块绑定）
const batch1Fns = [];
for (const bf of ["settings.js", "messages.js", "members.js", "notes.js", "quick-tasks.js", "sessions.js", "calendar.js", "uploads.js"]) {
  const c = fs.readFileSync(path.join("lib/domain", bf), "utf8");
  const m = c.match(/\n  return \{\n    ([\s\S]+?)\n  \};\n\}\s*$/);
  if (m) m[1].split(",").map((s) => s.trim().replace(/,$/, "")).filter(Boolean).forEach((x) => batch1Fns.push(x));
}
const assembly = [
  "  // ===== V2.6.1 批2拆分：模块组装（顺序 assign；跨模块依赖走转发箭头，顺序仅影响可读性）=====",
  `  const ctx = { ${CTX_BASE.join(", ")} };`,
  ...extractedShared.length ? ["  // ===== 共享工具（剥离自各区块，闭包内提升）=====", ...extractedShared] : [],
  "  Object.assign(ctx, createCoreModule(ctx));",
  "  Object.assign(ctx, createFtsModule(ctx));",
  "  Object.assign(ctx, createAuditModule(ctx));",
  "  Object.assign(ctx, createSettingsModule(ctx), createMessagesModule(ctx), createMembersModule(ctx), createNotesModule(ctx), createQuickTasksModule(ctx), createSessionsModule(ctx), createCalendarModule(ctx), createUploadsModule(ctx));",
  `  Object.assign(ctx, ${MODULES.slice(3).map((m) => `${m.fn}(ctx)`).join(", ")});`,
  `  const { ${[...batch1Fns, ...made.flatMap((m) => m.blockFns)].join(", ")} } = ctx;`,
  "",
];
kept.splice(keptRet, 0, ...assembly);
// 4) 顶部 import 追加批2模块
const lastImport = kept.reduce((acc, l, i) => (l.startsWith("import ") ? i : acc), -1);
const imports2 = MODULES.map((m) => `import { ${m.fn} } from "./domain/${m.file}";`).join("\n");
kept.splice(lastImport + 1, 0, imports2);
fs.writeFileSync(FILE, kept.join("\n"), "utf8");
console.log("data.js 重写完成，新行数:", kept.length);
console.log("剥离共享函数:", extractedShared.filter((l) => l.startsWith("  function")).map((l) => l.match(/function (\w+)/)[1]).join(", "));
