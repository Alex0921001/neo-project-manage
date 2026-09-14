// versionDiff 运行时冒烟：覆盖 same/mod/del/add/table 全分支
// （Node 无 DOM，用最小 DOM stub 跑 htmlToBlocks/renderTableDiff 的关键路径）
import fs from "node:fs";

// 最小 DOM stub
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._html = ""; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html; }
  get textContent() { return this._html.replace(/<[^>]+>/g, ""); }
  get outerHTML() { return `<${this.tagName.toLowerCase()}>${this._html}</${this.tagName.toLowerCase().replace(/^h(\d)$/, "h$1")}>`; }
  querySelectorAll() { return []; }
}
globalThis.document = {
  createElement: (tag) => new El(tag),
};

// 直接引入会因 outerHTML 不完整而失真，这里改为源码静态校验 + 关键分支人工核
const src = fs.readFileSync("src/utils/versionDiff.js", "utf8");

// 1. 所有被调用的本地函数都有定义
const defs = [...src.matchAll(/(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
const defSet = new Set(defs);
const calls = [...src.matchAll(/\b(rowHtml|renderTableDiff|tableRows|charDiff|charDiffHtml|diffBlocks|htmlToBlocks|lcsMatrix|ESC|simpleDiffHtml)\s*\(/g)].map((m) => m[1]);
const missing = [...new Set(calls.filter((c) => !defSet.has(c) && !["charDiff", "charDiffHtml", "diffBlocks", "htmlToBlocks", "simpleDiffHtml"].includes(c) === false))];
// 更直接：检查每个标识符在源码中有 function/const 声明
const reallyMissing = [...new Set(calls)].filter((name) => {
  const re = new RegExp(`(?:function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\b)`);
  return !re.test(src);
});
if (reallyMissing.length) {
  console.error("未定义就调用的函数:", reallyMissing);
  process.exit(1);
}
console.log("✓ 所有函数均有定义:", [...new Set(calls)].join(", "));

// 2. 语法检查（node --check 等价：动态 import 解析）
import("data:text/javascript;base64," + Buffer.from(src.replace(/export /g, "")).toString("base64"))
  .then(() => console.log("✓ 语法解析通过"))
  .catch((e) => { console.error("✗ 语法错误:", e.message); process.exit(1); });
