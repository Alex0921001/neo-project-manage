/**
 * 格式化描述文本用于显示：
 * - 如果是 HTML（来自富文本编辑器），先经白名单清洗（P0-1）再原样渲染
 * - 如果是纯文本（来自 textarea），将换行转 <br>，空行转连续 <br>
 * - escape 掉可能的危险 HTML 字符后再插入 <br>，避免 XSS
 */
import { sanitizeHtml } from "./sanitize.js";

export function formatDescription(text) {
  if (!text) return "";
  // 简单启发式：如果包含明显的 HTML 块级标签或图片，走清洗后原样输出
  if (/(<\/?(?:p|div|br|ul|ol|li|h[1-6]|strong|em|u|b|i|img|a)\b)/i.test(text)) {
    return sanitizeHtml(text);
  }
  // 否则当作纯文本：先 escape，然后 \n → <br>，连续 \n 之间补一个 <br>
  const esc = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?/g, "\n");
  // 多个连续换行之间补一个 <br>，让空行视觉上是空行（两倍高度）
  return esc.replace(/\n/g, "<br>");
}

/**
 * 富文本 HTML 归一化：去标签后无实质内容且无资源节点（图片/链接）→ 返回空串
 * @param {string} html
 * @returns {string} 空内容返回 ""，否则原样返回（trim 后）
 */
export function normalizeRichText(html) {
  const t = (html || "").trim();
  if (!t) return "";
  const doc = new DOMParser().parseFromString(t, "text/html");
  // 含资源节点（img/a/video/iframe/source）→ 有内容，不可判空（P1-3）
  if (doc.body.querySelector("img, a, video, iframe, source, audio")) return t;
  const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return text ? t : "";
}
