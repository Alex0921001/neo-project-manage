#!/usr/bin/env node
/**
 * 静态检查：引用了某模块导出的符号，但当前文件既未 import 也未本地定义。
 *
 * 背景：批量重构（如 api.js → api/modules/* 迁移、ConfirmModal → confirmDialog 迁移）时，
 * 容易出现「调用点改了、import 行没补」的遗漏。这类问题不会构建报错，只在用户点击时抛
 * ReferenceError，表现为「功能点了没反应」。
 *
 * 用法：npm run check:imports   （退出码 1 表示发现问题）
 */
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.resolve(__dirname, "..", "src");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(vue|js)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function stripNoise(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")                       // 块注释
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")                 // 行注释（不误伤 http://）
    .replace(/`(?:\\.|[^`\\])*`/g, "``")                     // 模板字符串
    .replace(/"(?:\\.|[^"\\])*"/g, '""')                   // 双引号串（含转义）
    .replace(/'(?:\\.|[^'\\])*'/g, "''")                     // 单引号串
    .replace(/\/(?:\\.|\[[^\]]*\]|[^/\\\n])+\/[gimsuy]*/g, "/RE/"); // 正则字面量（粗略）
}

const files = walk(SRC);

// 1) 收集各模块导出符号
const exported = new Map(); // name -> [相对路径]
for (const file of files) {
  if (/\.test\.js$/.test(file)) continue;
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    if (!exported.has(m[1])) exported.set(m[1], []);
    exported.get(m[1]).push(rel);
  }
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!exported.has(m[1])) exported.set(m[1], []);
    exported.get(m[1]).push(rel);
  }
}

// 2) 逐文件比对
const problems = [];
for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  const src = fs.readFileSync(file, "utf8");
  const script = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n") || src;

  const imported = new Set();
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g)) {
    const braced = m[1].match(/\{([\s\S]*?)\}/);
    if (braced) {
      for (const part of braced[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) imported.add(name);
      }
    }
    const def = m[1].replace(/\{[\s\S]*?\}/, "").trim();
    if (def) imported.add(def.split(/\s+as\s+/)[0].trim());
  }

  const declared = new Set();
  for (const m of script.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of script.matchAll(/\{([^{}]*)\}\s*=/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (name) declared.add(name);
    }
  }

  const code = stripNoise(script);
  for (const [name, from] of exported) {
    if (declared.has(name) || imported.has(name)) continue;
    // 裸引用：前面不是 . 或标识符字符；排除对象字面量的键（name:）
    const re = new RegExp(`(^|[^\\w$.])${name}\\b(?!\\s*:)`, "m");
    if (!re.test(code)) continue;
    problems.push({ file: rel, name, from: from.join(", ") });
  }
}

if (!problems.length) {
  console.log("[check-imports] OK：未发现「未导入即使用」的导出符号");
  process.exit(0);
}
console.log(`[check-imports] 发现 ${problems.length} 处可疑引用（请人工确认是否为误报）：`);
for (const p of problems) console.log(`  - ${p.file} :: ${p.name}   ← 可能来自 ${p.from}`);
process.exit(1);
