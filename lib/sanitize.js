/**
 * 轻量 HTML 白名单清洗器（零依赖，服务端写入统一清洗 — P0-1 存储型 XSS）
 *
 * 设计约束：
 * - 本插件富文本由 Tiptap 生成，标签集可控；Agent 工具 / REST 可写任意 HTML，必须在入库前清洗
 * - 不引入 jsdom / sanitize-html（会触碰 node_modules 原生模块链，且 jsdom 体积大）
 * - Token 级扫描 + 白名单重建：非白名单标签丢弃（保留文本），属性重新序列化，杜绝原样透传
 *
 * 白名单标签：p, br, ul, ol, li, h1-h6, strong, b, em, i, u, s, del, code, pre, blockquote, a, img, span
 * 白名单属性：a[href], img[src, alt, title]
 * 协议白名单：http:, https:, mailto:；img 额外允许 data:image/(png|jpe?g|gif|webp);base64；
 *             相对路径（/ 开头、./ 开头、无协议冒号）允许
 * 安全要点：禁 javascript: / data:text / svg / iframe / script / style / 事件属性（on*）
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

/**
 * 校验 URL 值：白名单协议 / 相对路径 / 受限 data:image
 * @param {string} value
 * @returns {string|null} 合法返回原值，非法返回 null
 */
function safeUrl(value) {
  const v = (value || "").trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  // 相对路径：/ 开头、./ 开头、或完全不含协议冒号
  if (lower.startsWith("/") || lower.startsWith("./") || !lower.includes(":")) return v;
  if (SAFE_PROTO.test(lower)) return v;
  if (SAFE_DATA_IMG.test(lower)) return v;
  return null;
}

// 标签或文本分段扫描：开/闭标签（含属性）或普通文本
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
// 属性提取（值可能带引号）
const ATTR_RE = /([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * 重建单个开标签的 HTML（属性白名单 + 协议校验）
 * @param {string} tag
 * @param {string} attrsStr
 * @returns {string|null} 非法返回 null（丢弃标签）
 */
function rebuildOpenTag(tag, attrsStr) {
  if (!ALLOWED_TAGS.has(tag)) return null;
  const allowed = ALLOWED_ATTRS[tag];
  const parts = [];
  if (allowed) {
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrsStr)) !== null) {
      const name = m[1].toLowerCase();
      if (!allowed.has(name)) continue; // 丢弃事件属性 / style / class 等
      const raw = m[3] ?? m[4] ?? m[5] ?? "";
      if (name === "href" || name === "src") {
        const safe = safeUrl(raw);
        if (!safe) continue; // javascript: 等协议被拦
        parts.push(`${name}="${safe.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
      } else {
        // alt / title：纯文本，escape 引号与 &
        parts.push(`${name}="${raw.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`);
      }
    }
  }
  return `<${tag}${parts.length ? " " + parts.join(" ") : ""}>`;
}

/**
 * 清洗 HTML 字符串
 * @param {string|null|undefined} html
 * @returns {string} 清洗后的安全 HTML
 */
export function sanitizeHtml(html) {
  if (!html) return "";
  const input = String(html);
  let out = "";
  let lastIndex = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(input)) !== null) {
    // 标签前的文本：escape < 与 &（&amp; 会在浏览器显示为 &amp; 原文，正确）
    const text = input.slice(lastIndex, m.index);
    if (text) out += text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const raw = m[0];
    const tag = m[1].toLowerCase();
    const attrsStr = m[2] || "";
    const isClose = raw.startsWith("</");
    if (isClose) {
      // 闭合标签：白名单内才输出（防止白名单标签被嵌套滥用，闭合不校验属性）
      if (ALLOWED_TAGS.has(tag)) out += `</${tag}>`;
    } else {
      const rebuilt = rebuildOpenTag(tag, attrsStr);
      if (rebuilt) {
        out += rebuilt;
        // 空元素补闭合（HTML5 中 br/img 不闭合也合法，这里不强制）
      }
    }
    lastIndex = m.index + raw.length;
  }
  // 尾部文本
  const tail = input.slice(lastIndex);
  if (tail) out += tail.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return out;
}

/**
 * 判空：去标签文本为空且无资源标签（img/a/video/iframe/source）→ 视为空
 * 用于富文本备注「只含图片」不被误判为空（P1-3）
 * @param {string} html 已清洗的 HTML
 * @returns {boolean}
 */
export function richTextEmpty(html) {
  const clean = sanitizeHtml(html);
  const text = clean
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
  if (text) return false;
  // 无文本但有资源节点 → 非空（图片/链接内容被保留）
  return !/<(img|a|video|iframe|source|audio)\b/i.test(clean);
}
