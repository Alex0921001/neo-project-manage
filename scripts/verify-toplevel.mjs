// 检测 domain 模块引用了 data.js 顶层/导入符号（切割脚本未捕获的第 3 类依赖）
import fs from "fs";
const dataJs = fs.readFileSync("lib/data.js", "utf8").split("\n");
// data.js 顶层符号：0 缩进的 function/const + import 进来的名字
const topLevel = new Set();
for (const l of dataJs) {
  let m = l.match(/^(?:function|const|let) (\w+)/);
  if (m) topLevel.add(m[1]);
  m = l.match(/^import \{([^}]+)\}/);
  if (m) m[1].split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => topLevel.add(x));
}
for (const f of fs.readdirSync("lib/domain")) {
  const c = fs.readFileSync("lib/domain/" + f, "utf8");
  const missing = new Set();
  for (const name of topLevel) {
    if (new RegExp("\\b" + name + "\\(").test(c) || new RegExp("\\b" + name + "\\b(?=\\s*[.=;)\\s])").test(c)) {
      // 模块内是否自己定义或已解构
      const defined = new Set([...c.matchAll(/(?:function|const|let) (\w+)/g)].map((x) => x[1]));
      if (!defined.has(name)) missing.add(name);
    }
  }
  if (missing.size) console.log(`${f}: 顶层/导入依赖 → ${[...missing].join(", ")}`);
}
console.log("scan done");
