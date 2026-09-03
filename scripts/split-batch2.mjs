// 批2切割：14 个大域模块。关键升级：
// 1) deps 自动检测：初始共享 → 解构；跨模块函数 → 转发箭头（运行时解引用，顺序无关、环安全）
// 2) 共享工具函数（normalizeDate/htmlToPlain 等 7 个）从区块剥离保留在 data.js 闭包
// 3) 保留导出 return 对象原文
import fs from "fs";
import path from "path";

const FILE = "lib/data.js";
const lines = fs.readFileSync(FILE, "utf8").split("\n");

// ---- 常量 ----
const SHARED = new Set(["db","shortId","escapeLike","htmlToPlain","truncateText","sanitizeHtml","richTextEmpty",
  "normalizeDate","localToday","localNowIso","addDays","diffDays","parseAssignees","parseMembers","parseSessionIds"]);
const EXTRACT = ["normalizeDate","htmlToPlain","truncateText","localToday","localNowIso","addDays","diffDays"]; // 从区块剥离保留闭包
const CTX_BASE = ["db","shortId","escapeLike","htmlToPlain","truncateText","sanitizeHtml","richTextEmpty",
  "normalizeDate","localToday","localNowIso","addDays","diffDays","parseAssignees","parseMembers","parseSessionIds"];

const MODULES = [
  { title: ["status 计算"], file: "core.js", fn: "createCoreModule" },
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
  let pieces = [];
  const ranges = mod.title.map((t) => findBlock(t));
  const start = ranges[0].start;
  const end = ranges[ranges.length - 1].end;
  let blockLines = lines.slice(start, end + 1);
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
  cuts.push([start, end]);
  console.log(`${mod.file}: L${start + 1}~L${end + 1} (${blockLines.length} 行, ${blockFns.length} 函数, 解构${destruct.size} 转发${forward.size})`);
}

// ---- data.js 重组 ----
// 1) 删除批2区块（从后往前）
cuts.sort((a, b) => b[0] - a[0]);
for (const [s, e] of cuts) {
  let sp = s;
  if (sp > 0 && lines[sp - 1].trim() === "") sp--;
  lines.splice(sp, e - sp + 1);
}
// 2) 旧组装块定位（mark "V2.6.1 拆分：低耦合域模块组装"）
const ai = marks.findIndex((m) => m.title.startsWith("V2.6.1 拆分：低耦合域模块组装"));
let aStart = -1, aReturnIdx = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes("低耦合域模块组装")) { aStart = i; break; }
}
if (aStart < 0) throw new Error("旧组装块未找到");
for (let i = aStart; i < lines.length; i++) {
  if (lines[i] === "  return {") { aReturnIdx = i; break; }
}
if (aReturnIdx < 0) throw new Error("导出 return 未找到");
// return 导出对象原文（含结尾）
let depth = 0, retEnd = -1;
for (let i = aReturnIdx; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
  if (depth === 0 && i > aReturnIdx) { retEnd = i; break; }
}
const exportBlockLines = lines.slice(aReturnIdx, retEnd + 1);
// 3) 删除旧组装块（aStart 到文件尾），换成新组装
const tail = [
  "  // ===== V2.6.1 批2拆分：模块组装（顺序 assign；跨模块依赖走转发箭头，顺序仅影响可读性）=====",
  `  const ctx = { ${CTX_BASE.join(", ")} };`,
  ...extractedShared.length ? ["  // ===== 共享工具（剥离自各区块，闭包内提升）=====", ...extractedShared] : [],
  `  Object.assign(ctx, createCoreModule(ctx));`,
  `  Object.assign(ctx, createFtsModule(ctx));`,
  `  Object.assign(ctx, createAuditModule(ctx));`,
  `  Object.assign(ctx, createSettingsModule(ctx), createMessagesModule(ctx), createMembersModule(ctx), createNotesModule(ctx), createQuickTasksModule(ctx), createSessionsModule(ctx), createCalendarModule(ctx), createUploadsModule(ctx));`,
  `  Object.assign(ctx, ${MODULES.slice(3).map((m) => `${m.fn}(ctx)`).join(", ")});`,
  `  const { ${made.flatMap((m) => m.blockFns).join(", ")} } = ctx;`,
  "",
  ...exportBlockLines,
];
lines.splice(aStart);
lines.push(...tail);
// 4) 顶部 import 追加批2模块
const srcNow = lines.join("\n").split("\n");
const lastImport = srcNow.reduce((acc, l, i) => (l.startsWith("import ") ? i : acc), -1);
const imports2 = MODULES.map((m) => `import { ${m.fn} } from "./domain/${m.file}";`).join("\n");
srcNow.splice(lastImport + 1, 0, imports2);
fs.writeFileSync(FILE, srcNow.join("\n"), "utf8");
console.log("data.js 重写完成，新行数:", srcNow.length);
console.log("剥离共享函数:", extractedShared.filter((l) => l.startsWith("  function")).map((l) => l.match(/function (\w+)/)[1]).join(", "));
