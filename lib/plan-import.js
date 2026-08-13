/**
 * 方案文件解析（V2.1）：txt / md / docx → { title, content(HTML) }
 *
 * 零新增依赖策略：
 * - txt：Node 原生读 utf8，段落转 <p>
 * - md：手写轻量转换器（标题/列表/代码块/引用/链接/表格/行内标记）
 * - docx：docx 本质是 zip，用系统 tar（Windows 10 1803+ 内置 bsdtar）解压
 *   word/document.xml 后按段落提取 <w:t> 文本
 *
 * 限制：仅接受 txt / md / markdown / docx；单文件 ≤ 5MB；docx 需系统 tar 可用
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const PLAN_IMPORT_EXTS = new Set(["txt", "md", "markdown", "docx"]);
export const PLAN_IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5MB

/** 转义 HTML 特殊字符（正文文本安全） */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 行内标记处理：粗体/斜体/删除线/行内代码/链接 */
function inline(text) {
  let s = esc(text);
  // 行内代码（先处理，避免内部内容被其他规则误伤）
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  // 粗体 **x** / __x__
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // 斜体 *x* / _x_
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  // 删除线 ~~x~~
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s;
}

/** 检测是否表格分隔行（| --- | --- |） */
function isTableSep(line) {
  const t = line.replace(/^\||\|$/g, "").trim();
  return /^(\s*:?-{2,}:?\s*\|?\s*)+$/.test(t) && t.includes("-");
}

/** Markdown → HTML（轻量转换，覆盖常见语法） */
function mdToHtml(md) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  let inList = null; // "ul" | "ol" | null
  let inTable = false;
  let tableRows = [];

  const closeList = () => {
    if (inList) { out.push(`</${inList}>`); inList = null; }
  };
  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [head, ...body] = tableRows;
    out.push("<table><thead><tr>" + head.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>");
    for (const row of body) out.push("<tr>" + row.map((c) => `<td>${c}</td>`).join("") + "</tr>");
    out.push("</tbody></table>");
    tableRows = [];
  };

  const pushBlock = (html) => {
    closeList();
    if (inTable) { flushTable(); inTable = false; }
    out.push(html);
  };

  for (; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // 代码块
    if (/^```/.test(trimmed)) {
      if (inCode) {
        pushBlock(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // 空行：断列表/表格
    if (trimmed === "") {
      closeList();
      if (inTable) { flushTable(); inTable = false; }
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const lv = h[1].length;
      pushBlock(`<h${lv}>${inline(h[2])}</h${lv}>`);
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      pushBlock("<hr/>");
      continue;
    }

    // 引用
    if (/^>\s?/.test(trimmed)) {
      pushBlock(`<blockquote>${inline(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    // 表格
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      if (isTableSep(trimmed)) continue; // 分隔行跳过
      closeList();
      inTable = true;
      tableRows.push(cells.map((c) => inline(c)));
      continue;
    }
    if (inTable) { flushTable(); inTable = false; }

    // 无序列表
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    // 有序列表
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    if (inList) closeList();

    // 普通段落（可能多行折叠为一段，简单按行处理）
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  closeList();
  if (inTable) flushTable();
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);
  return out.join("\n");
}

/** txt → HTML：空行分段 */
function txtToHtml(text) {
  const paras = String(text)
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.split("\n").map((l) => esc(l.trim())).filter(Boolean).join("<br/>"))
    .filter(Boolean);
  return paras.map((p) => `<p>${p}</p>`).join("\n");
}

/** docx：系统 tar 解压 word/document.xml → 段落文本数组 */
function readDocxXml(bytes) {
  // 写临时文件（tar 需要文件路径）
  const tmpPath = path.join(os.tmpdir(), `neo-pm-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.docx`);
  fs.writeFileSync(tmpPath, bytes);
  try {
    // Windows 10 1803+ 内置 tar（bsdtar）；-xOf 直接输出到 stdout 不落盘
    const stdout = execFileSync("tar", ["-xOf", tmpPath, "word/document.xml"], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
      windowsHide: true,
    });
    return stdout;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

/** docx XML → HTML：按 <w:p> 段落，标题映射 h1-h6，其余 p */
function docxXmlToHtml(xml) {
  // 段落拆分（含自闭合 <w:p/>）
  const paras = xml.split(/<\/w:p>/g).filter((s) => s.includes("<w:p"));
  const out = [];
  for (const para of paras) {
    // 提取本段 pStyle（标题等级）
    const styleMatch = /<w:pStyle w:val="(?:Heading|标题|[\u4e00-\u9fa5]*标题)?(\d)"[^>]*\/>/.exec(para);
    const heading = styleMatch ? Math.min(6, Math.max(1, Number(styleMatch[1]))) : null;
    // 提取全部 <w:t>（含 xml:space 保留空白）
    let text = "";
    const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let m;
    while ((m = tRe.exec(para)) !== null) text += m[1];
    // tab / 换行 处理（部分文档用 w:tab / w:br 而非文本内空白）
    text = text.replace(/\u0009/g, " ").trim();
    if (!text) continue;
    const html = inline(text);
    if (heading) out.push(`<h${heading}>${html}</h${heading}>`);
    else out.push(`<p>${html}</p>`);
  }
  return out.join("\n");
}

/**
 * 解析方案导入文件
 * @param {string} name 原始文件名（含扩展名）
 * @param {Buffer} bytes 文件内容
 * @returns {{ title: string, content: string }} title=文件名（去扩展名），content=HTML
 * @throws 非支持类型 / 超限 / 解析失败
 */
export function parsePlanFile(name, bytes) {
  const ext = path.extname(String(name || "")).slice(1).toLowerCase();
  if (!PLAN_IMPORT_EXTS.has(ext)) {
    throw new Error(`暂不支持 ${ext || "未知"} 文件类型，仅支持 txt / md / docx`);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error("文件内容为空");
  if (bytes.length > PLAN_IMPORT_MAX_BYTES) throw new Error("文件超过 5MB 限制");

  const title = path.basename(String(name), path.extname(String(name))).slice(0, 100);
  let content = "";

  if (ext === "txt") {
    content = txtToHtml(bytes.toString("utf8"));
  } else if (ext === "md" || ext === "markdown") {
    content = mdToHtml(bytes.toString("utf8"));
  } else if (ext === "docx") {
    let xml;
    try {
      xml = readDocxXml(bytes);
    } catch (e) {
      throw new Error(`docx 解析失败：${e.message || e}（需要系统 tar 支持）`);
    }
    if (!xml || !xml.includes("<w:document")) throw new Error("docx 解析失败：不是有效的 Word 文档");
    content = docxXmlToHtml(xml);
  }

  if (!content.trim()) throw new Error("文件未解析出有效内容");
  return { title, content };
}
