/**
 * 前端展示层 HTML 白名单清洗（P0-1 兜底）
 *
 * 服务端已在写入时统一清洗（lib/sanitize.js），此处兜底覆盖：
 * - 升级前已入库的旧数据（可能含未清洗 HTML）
 * - 展示前再清一次，双保险
 *
 * 与 lib/sanitize.js 白名单保持一致：p/br/ul/ol/li/h1-6/strong/b/em/i/u/s/del/code/pre/blockquote/a/img/span
 * 属性：a[href] img[src,alt,title]；协议：http/https/mailto + data:image(raster) + 相对路径
 */
const ALLOWED_TAGS = new Set([
  "p", "br", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "blockquote",
  "a", "img", "span",
]);

const ALLOWED_ATTRS = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "title"]),
};

const SAFE_PROTO = /^(https?:|mailto:)/i;
const SAFE_DATA_IMG = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

function safeUrl(value) {
  const v = (value || "").trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower.startsWith("/") || lower.startsWith("./") || !lower.includes(":")) return v;
  if (SAFE_PROTO.test(lower)) return v;
  if (SAFE_DATA_IMG.test(lower)) return v;
  return null;
}

/**
 * 清洗 HTML（DOMParser 解析 → 白名单重建）
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // 丢弃标签，保留子节点（文本内容不丢）
      const frag = document.createDocumentFragment();
      for (const child of [...node.childNodes]) {
        const c = cleanNode(child);
        if (c) frag.appendChild(c);
      }
      return frag;
    }
    const el = document.createElement(tag);
    for (const attr of node.attributes) {
      if (!ALLOWED_ATTRS[tag] || !ALLOWED_ATTRS[tag].has(attr.name)) continue;
      if (attr.name === "href" || attr.name === "src") {
        const safe = safeUrl(attr.value);
        if (!safe) continue;
        el.setAttribute(attr.name, safe);
      } else {
        el.setAttribute(attr.name, attr.value);
      }
    }
    for (const child of [...node.childNodes]) {
      const c = cleanNode(child);
      if (c) el.appendChild(c);
    }
    return el;
  }

  const frag = document.createDocumentFragment();
  for (const child of [...doc.body.childNodes]) {
    const c = cleanNode(child);
    if (c) frag.appendChild(c);
  }
  return frag.innerHTML;
}
