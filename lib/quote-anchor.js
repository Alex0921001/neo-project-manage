/**
 * 评论引用后台补锚
 *
 * 背景：Agent/MCP 添加引用评论时只能传 quoteText（纯文字），正文无标注 span，
 * 前端按「无正文标注」降级灰显不可定位。本模块在服务端把 quoteText 定位到正文
 * HTML 的纯文本序列中，包裹与前端划词一致的标注 span，使评论可点击定位。
 *
 * 与前端的关键约定（frontend/src/utils/quoteComment.js，勿单方面改动）：
 * - 标注形态：<span class="qc-mark" data-quote-comment="评论ID">引用文字</span>
 * - 纯文本序列：按文档序拼接文本（实体解码后），等价于 DOM textContent
 * - 跨文本段（如跨 inline 标签）产出多个同 ID 分片 span，与 applyQuoteToDom 分片一致
 * - Tiptap QuoteCommentMark.parseHTML = span[data-quote-comment]，编辑器自动保留
 *
 * 定位失败（找不到文字）返回 null，调用方降级为纯文字引用，不影响评论创建。
 */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  ldquo: "\u201C",
  rdquo: "\u201D",
  lsquo: "\u2018",
  rsquo: "\u2019",
  middot: "\u00B7",
  laquo: "\u00AB",
  raquo: "\u00BB",
  times: "\u00D7",
};

/**
 * 扫描 HTML 为段序列。
 * @param {string} html
 * @returns {{ segs: Array, plain: string }}
 *   文本段：{ type:"text", htmlStart, raw, text(解码后), map(每码元的原文偏移), plainStart }
 *   其余（标签/注释）不产出段，仅跳过。
 */
function scanHtml(html) {
  const segs = [];
  let plain = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i);
        i = end === -1 ? n : end + 3;
      } else {
        const end = html.indexOf(">", i);
        if (end === -1) break; // 残缺标签：剩余内容不作为文本参与匹配
        i = end + 1;
      }
      continue;
    }
    const htmlStart = i;
    const units = []; // 解码后的码元
    const map = []; // 每个码元对应的原文偏移
    while (i < n && html[i] !== "<") {
      if (html[i] === "&") {
        const semi = html.indexOf(";", i);
        const name = semi > i + 1 && semi - i <= 9 ? html.slice(i + 1, semi) : null;
        let decoded = null;
        if (name) {
          if (name[0] === "#") {
            const code = name[1] === "x" || name[1] === "X"
              ? parseInt(name.slice(2), 16)
              : parseInt(name.slice(1), 10);
            if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
              try { decoded = String.fromCodePoint(code); } catch { /* 非法码点按字面 */ }
            }
          } else if (ENTITIES[name]) {
            decoded = ENTITIES[name];
          }
        }
        if (decoded !== null) {
          for (const u of decoded) { units.push(u); map.push(i); }
          i = semi + 1;
          continue;
        }
      }
      units.push(html[i]);
      map.push(i);
      i++;
    }
    const text = units.join("");
    segs.push({ type: "text", htmlStart, raw: html.slice(htmlStart, i), text, map, plainStart: plain.length });
    plain += text;
  }
  return { segs, plain };
}

/**
 * 在 HTML 中查找 quoteText 并包裹引用标注 span。
 * @param {string} html 正文 HTML
 * @param {string} quoteText 引用文字（按解码后纯文本精确匹配，多匹配取首个）
 * @param {string} commentId 评论 ID
 * @returns {{ html: string, anchor: {start:number, end:number} } | null} 找不到返回 null
 */
export function anchorQuoteInHtml(html, quoteText, commentId) {
  const src = String(html || "");
  const q = String(quoteText || "");
  if (!src || !q || !commentId) return null;
  const { segs, plain } = scanHtml(src);
  // 精确匹配优先；失败后空白归一化宽容匹配（\s 与 \u00A0 → 半角空格，1:1 映射还原偏移）
  let start = plain.indexOf(q);
  let end = 0;
  if (start !== -1) {
    end = start + q.length;
  } else {
    const normChars = [];
    const normMap = [];
    for (let i = 0; i < plain.length; i++) {
      const ch = plain[i];
      normChars.push(ch === "\u00A0" || /\s/.test(ch) ? " " : ch);
      normMap.push(i);
    }
    const qNorm = Array.from(q, (ch) => (ch === "\u00A0" || /\s/.test(ch) ? " " : ch)).join("");
    const ns = normChars.join("").indexOf(qNorm);
    if (ns === -1) return null;
    const ne = ns + qNorm.length;
    start = normMap[ns];
    end = normMap[ne - 1] + 1;
  }

  // 覆盖区间涉及的文本段（区间端点为纯文本偏移，前闭后开）
  const openTag = `<span class="qc-mark" data-quote-comment="${commentId}">`;
  const insertions = [];
  for (const s of segs) {
    if (s.type !== "text" || !s.text.length) continue;
    const segEnd = s.plainStart + s.text.length; // 纯文本区间，前闭后开
    if (segEnd <= start || s.plainStart >= end) continue;
    const from = Math.max(start, s.plainStart);
    const to = Math.min(end, segEnd);
    // 开标签：from 字符的原文偏移；闭标签：to 处字符的原文偏移（或段尾）
    // map 存的已是原文绝对偏移，不再叠加 htmlStart
    const openPos = s.map[from - s.plainStart];
    const closePos = to === segEnd
      ? s.htmlStart + s.raw.length
      : s.map[to - s.plainStart];
    insertions.push({ pos: openPos, tag: openTag });
    insertions.push({ pos: closePos, tag: "</span>" });
  }
  if (!insertions.length) return null;
  // 从后往前插入避免偏移失效；同位先闭后开，保证嵌套场景闭合方向正确
  insertions.sort((a, b) => b.pos - a.pos || (a.tag === "</span>" ? -1 : 1));
  let out = src;
  for (const { pos, tag } of insertions) {
    out = out.slice(0, pos) + tag + out.slice(pos);
  }
  return { html: out, anchor: { start, end } };
}
