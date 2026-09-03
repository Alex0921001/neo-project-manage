// 分析 data.js：每个区块内的函数清单 + 区块内引用的"外部符号"（ctx 解构候选）
import fs from "fs";
const lines = fs.readFileSync("lib/data.js", "utf8").split("\n");
// 定位 createDataAccess 闭包内的区块边界与函数
const marks = [];
lines.forEach((l, i) => {
  const m = l.match(/^\s*\/\/ =====\s*(.+?)\s*=+\s*$/);
  if (m) marks.push({ line: i, title: m[1] });
});
const fnRe = /^  function (\w+)/;
const fns = [];
lines.forEach((l, i) => { const m = l.match(fnRe); if (m) fns.push({ name: m[1], line: i }); });

const targets = process.argv[2] ? process.argv[2].split("|") : marks.map((m) => m.title);

for (const t of targets) {
  const mi = marks.findIndex((m) => m.title.startsWith(t));
  if (mi < 0) { console.log("MISS:", t); continue; }
  const start = marks[mi].line;
  const end = mi + 1 < marks.length ? marks[mi + 1].line - 1 : lines.length - 1;
  const block = lines.slice(start, end + 1);
  const blockFns = [...new Set(block.map((l) => (l.match(fnRe) || [])[1]).filter(Boolean))];
  // 引用的区块外符号：全部已知函数名中不在本区块的 + 已知共享符号
  const known = new Set(fns.map((f) => f.name));
  const externals = new Set();
  for (const line of block) {
    for (const m of line.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)) {
      const name = m[1];
      if (known.has(name) && !blockFns.includes(name)) externals.add(name);
    }
  }
  const builtin = new Set(["if","for","while","switch","catch","return","function","typeof","String","Number","Boolean","Date","Array","Object","JSON","Math","parseInt","parseFloat","encodeURIComponent","decodeURIComponent","require"]);
  const ext = [...externals].filter((x) => !builtin.has(x));
  console.log(`\n### ${t} (L${start + 1}~L${end + 1}, ${block.length}行)`);
  console.log("函数:", blockFns.join(", "));
  console.log("外部引用:", ext.join(", "));
}
if (process.argv[2]) process.exit(0);
console.log("\n=== 全部区块 ===");
marks.forEach((m) => console.log(`L${m.line + 1}  ${m.title}`));
