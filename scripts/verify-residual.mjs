// 残留引用校验：已搬移到 domain 模块的函数，在 data.js 中只允许出现在 import / 组装解构行
import fs from "fs";
const src = fs.readFileSync("lib/data.js", "utf8");
const lines = src.split("\n");
const names = new Set();
for (const f of fs.readdirSync("lib/domain")) {
  const c = fs.readFileSync("lib/domain/" + f, "utf8");
  for (const m of c.matchAll(/^    (\w+),$/gm)) names.add(m[1]); // return 块里的函数名
}
let bad = 0;
lines.forEach((l, i) => {
  if (l.startsWith("import ") || l.includes("= ctx") || /^\s+\},?\s*$/.test(l) || l.includes("Object.assign")) return;
  for (const n of names) {
    if (new RegExp("\\b" + n + "\\b").test(l)) { console.log(`残留 L${i + 1}: ${n} | ${l.trim().slice(0, 80)}`); bad++; }
  }
});
console.log(bad ? `残留 ${bad} 处 ✗` : "data.js 无残留引用 ✓");
