// 检测各 domain 模块中"宿主标识符.方法"形式的裸依赖（db/fs/path/crypto 等）
import fs from "fs";
const builtin = new Set(["if","for","while","switch","catch","return","function","const","let","var","new","typeof","window","document","JSON","Math","Date","Array","Object","String","Number","Boolean","Error","parseInt","parseFloat","process","console","require"]);
const ctxDeps = new Set();
for (const f of fs.readdirSync(".")) {
  const c = fs.readFileSync(f, "utf8");
  const m = c.match(/const \{ ([^}]+) \} = ctx;/);
  if (m) m[1].split(",").map((s) => s.trim()).filter(Boolean).forEach((x) => ctxDeps.add(x));
}
for (const f of fs.readdirSync(".")) {
  const c = fs.readFileSync(f, "utf8");
  const m = c.match(/const \{ ([^}]+) \} = ctx;/);
  const have = new Set((m ? m[1].split(",").map((s) => s.trim()) : []));
  // 本文件定义的标识符
  const defined = new Set([...c.matchAll(/(?:^|\n)\s*(?:function (\w+)|const (\w+)|let (\w+))/gm)].flatMap((x) => [x[1], x[2], x[3]]).filter(Boolean));
  const missing = new Set();
  for (const h of c.matchAll(/(?:^|[^.\w])([a-z_]\w*)\s*\./gm)) {
    const host = h[1];
    if (!have.has(host) && !defined.has(host) && !["ctx", "fs", "path", "crypto"].includes(host)) missing.add(host);
  }
  if (missing.size) console.log(`${f}: 缺解构 → ${[...missing].join(", ")}`);
}
console.log("done");
