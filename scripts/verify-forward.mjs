// 终极断言：转发箭头名字 ∈ ctx 键；CTX_BASE 名字真实存在
import fs from "fs";
import path from "path";
const dataJs = fs.readFileSync("lib/data.js", "utf8").replace(/\r\n/g, "\n");
const ctxLine = dataJs.split("\n").find((l) => l.includes("const ctx = {"));
const ctxBase = new Set(ctxLine.match(/\{ (.+) \};/)[1].split(",").map((s) => s.trim()).filter(Boolean));
const imports = new Set();
for (const m of dataJs.matchAll(/^import \{([^}]+)\}/gm)) m[1].split(",").map((s) => s.trim()).forEach((x) => imports.add(x));
const moduleFns = new Set();
let bad = 0;
for (const f of fs.readdirSync("lib/domain")) {
  const c = fs.readFileSync(path.join("lib/domain", f), "utf8");
  const m = c.match(/\n  return \{\n    ([\s\S]+?)\n  \};\n\}\s*$/);
  if (m) m[1].split(",").map((s) => s.trim().replace(/,$/, "")).filter(Boolean).forEach((x) => moduleFns.add(x));
  else console.log(f, ": 尾部 return 提取失败");
}
for (const f of fs.readdirSync("lib/domain")) {
  const c = fs.readFileSync(path.join("lib/domain", f), "utf8");
  for (const m of c.matchAll(/const (\w+) = \(\.\.\.a\) => ctx\.(\w+)\(\.\.\.a\);/g)) {
    if (!ctxBase.has(m[2]) && !moduleFns.has(m[2])) { console.log(`${f}: 转发 ${m[2]} 不在 ctx 键！`); bad++; }
  }
}
console.log(bad === 0 ? "转发断言全过 ✓" : `${bad} 处断言失败`);
for (const n of ctxBase) {
  if (!new RegExp(`\\b(function|const) ${n}\\b`).test(dataJs) && !imports.has(n)) console.log(`CTX_BASE 的 ${n} 在 data.js 中不存在！`);
}
console.log("CTX_BASE 存在性检查完成，模块函数总数:", moduleFns.size);
