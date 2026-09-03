// 批1切割：从 data.js 按区块行号机械搬移 8 个低耦合域到 lib/domain/*.js
// 策略：整块源码原样搬移（不重构逻辑），模块头注入 ctx 解构，data.js 删区块 + 挂 ctx + 大解构保导出
import fs from "fs";
import path from "path";

const FILE = "lib/data.js";
const lines = fs.readFileSync(FILE, "utf8").split("\n");

// 导出快照（拆分前）：提取导出对象内所有简写 key
const retIdx = lines.findIndex((l) => l === "  return {");
if (retIdx < 0) throw new Error("找不到导出 return {");
let depth = 0, retEnd = -1;
for (let i = retIdx; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
  if (depth === 0 && i > retIdx) { retEnd = i; break; }
}
const exportBlock = lines.slice(retIdx, retEnd + 1).join("\n");
const exportKeys = [...exportBlock.matchAll(/^\s{4}(\w+),?\s*(?:\/\/.*)?$/gm)].map((m) => m[1]).filter(Boolean);
fs.writeFileSync("scripts/exports-before.txt", exportKeys.sort().join("\n"));
console.log("导出快照:", exportKeys.length, "个");

// 区块 → 模块映射（title 前缀匹配）
const MODULES = [
  { title: "设置", file: "settings.js", fn: "createSettingsModule", deps: [] },
  { title: "消息中心", file: "messages.js", fn: "createMessagesModule", deps: ["localToday", "addDays", "getMessageConfig", "listProjects", "summarizeProject", "logAudit"] },
  { title: "Members", file: "members.js", fn: "createMembersModule", deps: ["logAudit"] },
  { title: "Notes", file: "notes.js", fn: "createNotesModule", deps: ["logAudit", "auditText"] },
  { title: "Quick Tasks", file: "quick-tasks.js", fn: "createQuickTasksModule", deps: ["truncateText", "createTask"] },
  { title: "会话关联", file: "sessions.js", fn: "createSessionsModule", deps: ["logAudit"] },
  { title: "日历任务", file: "calendar.js", fn: "createCalendarModule", deps: [] },
  { title: "图片上传", file: "uploads.js", fn: "createUploadsModule", deps: [] },
];

// 定位区块（含头部注释行到下一区块注释前一行）
const marks = [];
lines.forEach((l, i) => {
  const m = l.match(/^\s*\/\/ =====\s*(.+?)\s*=+\s*$/);
  if (m) marks.push({ line: i, title: m[1] });
});

const cuts = []; // { start, end } 行索引闭区间
const made = [];
fs.mkdirSync("lib/domain", { recursive: true });

for (const mod of MODULES) {
  const mi = marks.findIndex((m) => m.title.startsWith(mod.title));
  if (mi < 0) throw new Error("区块未找到: " + mod.title);
  const start = marks[mi].line;
  const end = (mi + 1 < marks.length ? marks[mi + 1].line : lines.length) - 1;
  // 吞掉区块后的连续空行
  let e = end;
  while (e > start && lines[e].trim() === "") e--;
  const block = lines.slice(start, e + 1);
  // 区块内实际函数名（return 导出用）
  const blockFns = [...new Set(block.map((l) => (l.match(/^  function (\w+)/) || [])[1]).filter(Boolean))];
  const header = `// ${mod.title.replace(/\s*=+$/, "")}（V2.6.1 拆分自 data.js，机械搬移不改逻辑）\n// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import\nexport function ${mod.fn}(ctx) {\n` +
    (mod.deps.length ? `  const { ${mod.deps.join(", ")} } = ctx;\n` : "");
  const src = header + block.join("\n") + `\n  return {\n    ${blockFns.join(",\n    ")},\n  };\n}\n`;
  fs.writeFileSync(path.join("lib/domain", mod.file), src, "utf8");
  made.push({ mod, blockFns });
  cuts.push([start, e]);
  console.log(`${mod.file}: L${start + 1}~L${e + 1} (${block.length} 行, ${blockFns.length} 函数)`);
}

// data.js：从后往前删除区块
cuts.sort((a, b) => b[0] - a[0]);
for (const [s, e] of cuts) {
  // 连带删除区块前的空行（最多 1 行，保持区块间紧凑）
  let sp = s;
  if (sp > 0 && lines[sp - 1].trim() === "") sp--;
  lines.splice(sp, e - sp + 1);
}

// 顶层 import 插入：找第一条 import 行之后
const firstImport = lines.findIndex((l) => l.startsWith("import "));
const imports = MODULES.map((m) => `import { ${m.fn} } from "./domain/${m.file}";`).join("\n");
lines.splice(firstImport, 0, imports);

// 组装块插入：导出 return { 之前（重新计算位置，删除后行号已变）
const src2 = lines.join("\n");
const ret2 = src2.split("\n").findIndex((l) => l === "  return {");
const allFns = made.flatMap((m) => m.blockFns);
const ctxDeps = ["logAudit", "auditText", "localToday", "addDays", "truncateText", "listProjects", "summarizeProject", "createTask"];
const assembly = [
  "  // ===== V2.6.1 拆分：低耦合域模块组装（ctx 注入；闭包函数经提升此处可直接引用）=====",
  `  const ctx = { db, shortId, escapeLike, htmlToPlain, truncateText, sanitizeHtml, normalizeDate, localToday, addDays, resolveRowById,`,
  `    logAudit, auditText, listProjects, summarizeProject, createTask };`,
  `  Object.assign(ctx, ${MODULES.map((m) => `${m.fn}(ctx)`).join(", ")});`,
  `  const { ${made.flatMap((m) => m.blockFns).join(", ")} } = ctx;`,
  "",
];
const out = src2.split("\n");
out.splice(ret2, 0, ...assembly);
fs.writeFileSync(FILE, out.join("\n"), "utf8");
console.log("data.js 重写完成，新行数:", out.length);
