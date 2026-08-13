import { parsePlanFile } from "../../lib/plan-import.js";

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✖ ${name}`, extra ?? ""); }
}

// ===== txt =====
{
  const r = parsePlanFile("需求说明.txt", Buffer.from("第一段\n第二行\n\n第二段"));
  assert("txt 标题=文件名去扩展名", r.title === "需求说明", r.title);
  assert("txt 空行分段", r.content.includes("<p>第一段<br/>第二行</p>"), r.content);
  assert("txt 多段", (r.content.match(/<p>/g) || []).length === 2, r.content);
}

// ===== md =====
{
  const md = `# 标题一\n\n## 标题二\n\n**加粗**和*斜体*和\`代码\`\n\n- 项1\n- 项2\n\n1. 一\n2. 二\n\n> 引用\n\n| 名称 | 值 |\n| --- | --- |\n| A | 1 |\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n[链接](https://example.com)`;
  const r = parsePlanFile("方案.md", Buffer.from(md));
  assert("md 标题", r.content.includes("<h1>标题一</h1>") && r.content.includes("<h2>标题二</h2>"), r.content);
  assert("md 行内标记", r.content.includes("<strong>加粗</strong>") && r.content.includes("<em>斜体</em>") && r.content.includes("<code>代码</code>"), r.content);
  assert("md 无序列表", r.content.includes("<ul>") && r.content.includes("<li>项1</li>"), r.content);
  assert("md 有序列表", r.content.includes("<ol>") && r.content.includes("<li>一</li>"), r.content);
  assert("md 引用", r.content.includes("<blockquote>引用</blockquote>"), r.content);
  assert("md 表格", r.content.includes("<table>") && r.content.includes("<th>名称</th>") && r.content.includes("<td>A</td>"), r.content);
  assert("md 代码块", r.content.includes("<pre><code>const x = 1;") && r.content.includes("</code></pre>"), r.content);
  assert("md 链接", r.content.includes('<a href="https://example.com"'), r.content);
}

// ===== 类型限制 =====
{
  let threw = false;
  try { parsePlanFile("图.png", Buffer.from("xx")); } catch (e) { threw = e.message.includes("仅支持 txt / md / docx"); }
  assert("非支持类型拒绝", threw);
}

// ===== docx（构造最小 docx：手动打包 zip）=====
// 无外部 zip 库，跳过自动生成；若系统 tar 存在则验证报错行为（不存在文件条目）
{
  let err = null;
  try {
    parsePlanFile("文档.docx", Buffer.from("not a real zip"));
  } catch (e) { err = e; }
  assert("docx 非法内容报错", !!err && /解析失败/.test(err.message), err?.message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
