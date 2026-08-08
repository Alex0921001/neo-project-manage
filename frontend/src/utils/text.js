/**
 * 格式化描述文本用于显示：
 * - 富文本 HTML（含标签）：直接返回原文（服务端已 sanitize 白名单清洗，P0-1），前端不再重复转换
 * - 纯文本（旧数据 / 无标签）：escape 后换行转 <br>
 */
import { sanitizeHtml } from "./sanitize.js";

export function formatDescription(text) {
  if (!text) return "";
  // 富文本（含块级标签或图片）：直接返回原文，v-html 渲染（服务端入库时已白名单清洗）
  if (/(<\/?(?:p|div|br|ul|ol|li|h[1-6]|strong|em|u|b|i|img|a)\b)/i.test(text)) {
    return text;
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
 * 富文本 HTML 转纯文本摘录（去标签、解实体、压缩空白）
 * 用于列表/卡片等纯文本摘要场景（如项目列表卡片的两行截断），避免 <p> 等标签以文本形式暴露
 * @param {string} html
 * @returns {string}
 */
export function richTextToPlain(html) {
  if (!html) return "";
  const withBreaks = String(html).replace(/<br\s*\/?>/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent || "")
    .replace(/\u00a0/g, " ") // &nbsp; 经 textContent 解码为不换行空格
    .replace(/\s+/g, " ")
    .trim();
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
