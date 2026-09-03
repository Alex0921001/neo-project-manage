// 拆分后导出名单一致性校验：必须与拆分前快照 100% 一致
import fs from "fs";
const lines = fs.readFileSync("lib/data.js", "utf8").split("\n");
const retIdx = lines.findIndex((l) => l === "  return {");
let depth = 0, retEnd = -1;
for (let i = retIdx; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
  if (depth === 0 && i > retIdx) { retEnd = i; break; }
}
const exportKeys = [...lines.slice(retIdx, retEnd + 1).join("\n").matchAll(/^\s{4}(\w+),?\s*(?:\/\/.*)?$/gm)]
  .map((m) => m[1]).filter(Boolean).sort();
const before = fs.readFileSync("scripts/exports-before.txt", "utf8").split("\n").filter(Boolean).sort();
const removed = before.filter((x) => !exportKeys.includes(x));
const added = exportKeys.filter((x) => !before.includes(x));
console.log("拆分前:", before.length, "| 拆分后:", exportKeys.length);
if (removed.length || added.length) {
  console.log("缺失:", removed.join(", "));
  console.log("多余:", added.join(", "));
  process.exit(1);
}
console.log("导出名单 100% 一致 ✓");
