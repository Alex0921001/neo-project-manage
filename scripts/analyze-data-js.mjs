import fs from "fs";
const src = fs.readFileSync("lib/data.js", "utf8");
const lines = src.split("\n");
const fns = [...src.matchAll(/^  function (\w+)/gm)].map((m) => m[1]);
console.log("总行数:", lines.length, "| 内部函数:", fns.length);

// 每个"// ====="区块的行数分布
const marks = [];
lines.forEach((l, i) => { const m = l.match(/^\/\/ =====\s*(.+?)\s*=+/); if (m) marks.push({ line: i + 1, title: m[1] }); });
marks.forEach((m, i) => {
  const end = i + 1 < marks.length ? marks[i + 1].line - 1 : lines.length;
  console.log(`L${m.line} ~ L${end}  (${end - m.line + 1} 行)  ${m.title}`);
});

// 共享工具被调用次数（跨域耦合度指标）
const shared = ["db", "shortId", "escapeLike", "logAudit", "auditText", "markFtsDirty", "resolveRowById",
  "truncateText", "htmlToPlain", "normalizeDate", "localToday", "getSetting", "setSetting",
  "insertMessage", "scanMessages", "getVerificationRowOrThrow", "sanitizeHtml", "planRowToObject"];
for (const fn of shared) {
  const uses = (src.match(new RegExp("\\b" + fn + "\\(", "g")) || []).length;
  console.log(`${fn}: ${uses} 处调用`);
}
