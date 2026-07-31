/**
 * 搜索关键字高亮工具
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 纯文本高亮（用于任务名等 input 来源的文本）
 * 自动 HTML escape + 用 <mark class="hl"> 包裹匹配片段
 */
export function highlight(text, query) {
  const safe = escapeHtml(text == null ? "" : text);
  const q = (query || "").trim();
  if (!q) return safe;
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  return safe.replace(re, '<mark class="hl">$1</mark>');
}

/**
 * 富文本高亮（用于任务描述，可能含 contenteditable 产生的 HTML）
 * 不破坏已有标签，只在标签外的文本节点中插入 <mark>
 * 兼容纯文本描述（formatDescription 转 <br> 后文本在标签外）
 */
export function highlightRichText(html, query) {
  if (!html) return "";
  const q = (query || "").trim();
  if (!q) return html;
  const re = new RegExp(escapeRegExp(q), "gi");
  // 按 HTML 标签拆分：标签原样保留，标签外的文本（含纯文本描述）做高亮
  return String(html)
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part) return "";
      if (/^<[^>]+>$/.test(part)) return part;
      return part.replace(re, (m) => `<mark class="hl">${m}</mark>`);
    })
    .join("");
}