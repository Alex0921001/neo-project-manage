/**
 * read_project_file：读取项目已登记文件的内容（仅限已登记文件，防止任意路径读取越权）
 *
 * 规则：
 * - 文本类（txt/md/json/js/css/html/xml/csv/log 等）直接返回，截断前 8000 字符
 * - docx：复用 lib/plan-import.js 的 tar 解压 + <w:t> 提取链路（docxToText）
 * - pdf：零依赖简易提取（zlib inflate 文本流 + 括号字符串操作符扫描），
 *   扫描件/加密/无文本层 PDF 明确报「提取不到」
 * - 图片类型明确报「不支持提取」；其他二进制/未知类型报「不支持读取」
 * - 文件不存在/被移动 → 明确报错
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createDataAccess } from "../lib/data.js";
import { docxToText } from "../lib/plan-import.js";

export const name = "read_project_file";
export const description = "读取项目已登记文件的内容（文本类直接返回；docx/pdf 提取文本；图片/二进制明确报不支持）。仅限已登记文件，防任意路径读取。";
export const parameters = {
  type: "object",
  required: ["projectId", "fileId"],
  properties: {
    projectId: { type: "string", description: "项目 ID" },
    fileId: { type: "string", description: "已登记文件 ID" },
  },
};

/** 文本返回上限（字符） */
const MAX_TEXT_CHARS = 8000;
/** 单文件读取上限（字节）：防超大文件占内存 */
const MAX_READ_BYTES = 50 * 1024 * 1024;

/** 文本类扩展名（常见办公/代码/配置场景） */
const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "json", "js", "mjs", "cjs", "ts", "tsx", "vue", "jsx",
  "css", "scss", "less", "html", "htm", "xml", "csv", "tsv", "yml", "yaml",
  "toml", "ini", "cfg", "conf", "properties", "env", "log", "sql", "sh", "bat",
  "cmd", "ps1", "py", "java", "c", "cpp", "h", "hpp", "go", "rb", "php", "kt", "swift",
  "gitignore", "dockerfile", "lock",
]);

/** 图片类型（明确报不支持提取） */
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff", "avif"]);

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const file = data.getFile(input.projectId, input.fileId);
  if (!file) throw new Error(`项目 ${input.projectId} 中不存在文件 ${input.fileId}（仅可读取已登记文件）`);
  if (!file.path) throw new Error(`文件「${file.name}」未登记路径，无法读取`);
  if (!fs.existsSync(file.path)) throw new Error(`文件「${file.name}」不存在或已被移动（登记路径：${file.path}）`);

  const stat = fs.statSync(file.path);
  if (!stat.isFile()) throw new Error(`登记路径不是普通文件：${file.path}`);
  if (stat.size > MAX_READ_BYTES) throw new Error(`文件超过 ${MAX_READ_BYTES / 1024 / 1024}MB 限制，不支持读取`);

  const ext = (file.ext || path.extname(file.name).slice(1) || "").toLowerCase();

  // 图片：明确报不支持提取
  if (IMAGE_EXTS.has(ext)) {
    throw new Error(`文件「${file.name}」是图片类型（${ext}），不支持文本提取`);
  }

  let text = null;
  if (ext === "docx") {
    try {
      text = docxToText(fs.readFileSync(file.path));
    } catch (e) {
      throw new Error(`docx 解析失败：${e.message || e}`);
    }
    if (!text.trim()) throw new Error("docx 未提取到文本内容");
  } else if (ext === "pdf") {
    text = extractPdfText(fs.readFileSync(file.path));
    if (!text.trim()) {
      throw new Error("PDF 未提取到文本内容（可能为扫描件/加密，或字体无文本层）");
    }
  } else if (TEXT_EXTS.has(ext) || ext === "") {
    // 文本类 / 无扩展名：NUL 字节探测兜底（防二进制乱码输出）
    const buf = fs.readFileSync(file.path);
    if (buf.includes(0)) throw new Error(`文件「${file.name}」是二进制文件，不支持文本读取`);
    text = buf.toString("utf8");
  } else {
    throw new Error(`文件「${file.name}」类型 ${ext} 不支持读取（文本类 / docx / pdf 可读）`);
  }

  const truncated = text.length > MAX_TEXT_CHARS;
  const body = truncated ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n…（内容过长，已截断前 ${MAX_TEXT_CHARS} 字符）` : text;
  return { content: [{ type: "text", text: `📄 ${file.name}\n\n${body}` }] };
}

/**
 * PDF 简易文本提取（零新增依赖）：
 * 扫描所有 stream...endstream 块，尝试 zlib inflate（未压缩流原样处理），
 * 用括号字符串正则收集文本操作符（Tj/TJ）内容，转义反转义后拼接。
 * 局限：CID 字体（常见于中文 PDF）无 ToUnicode 映射时提取为空，报「提取不到」由调用方兜底。
 * @param {Buffer} bytes PDF 文件内容
 * @returns {string}
 */
function extractPdfText(bytes) {
  const raw = bytes.toString("latin1");
  const out = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    const block = m[1];
    let data = block;
    if (!block.includes("%PDF") && block.length > 4) {
      try {
        data = zlib.inflateSync(Buffer.from(block, "latin1")).toString("latin1");
      } catch {
        data = block; // 非压缩流，按原样扫描
      }
    }
    collectPdfTextOps(data, out);
  }
  collectPdfTextOps(raw, out); // 兜底：未进 stream 块的文本（极少见）
  return out.join("");
}

/**
 * 从 PDF 内容中收集括号字符串文本（覆盖 Tj 单串与 TJ 数组内的各串；字典字符串可能被误收，可接受）
 */
function collectPdfTextOps(data, out) {
  // 括号字符串：(内容) 内容中允许 \\( 转义，不允许未转义括号
  const strRe = /\(((?:\\.|[^\\()])*)\)/g;
  let m;
  while ((m = strRe.exec(data)) !== null) {
    const s = m[1].replace(/\\([\\()nrtbf])/g, (_g, ch) =>
      ({ "\\": "\\", "(": "(", ")": ")", n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[ch] ?? ch)
    );
    if (s) out.push(s);
  }
}
