/**
 * 划词引用评论（V2.6）
 *
 * 锚定策略：Tiptap QuoteCommentMark（文档数据内锚，内容重排不丢锚）。
 * 阅读模式（v-html，无编辑器实例）通过「纯文本偏移 + TextWalker 包裹 span」
 * 在 DOM 层打标，保存时 span 已写入文档 HTML；编辑器经 parseHTML 保留 mark。
 * 内容被编辑删除引用文字 → span 消失 → 评论退化为孤立评论（quote_text 灰显）。
 */
import { Mark, mergeAttributes } from "@tiptap/core";

/** Tiptap Mark：引用评论高亮，attr 为评论 ID */
export const QuoteCommentMark = Mark.create({
  name: "quoteComment",
  inclusive: false,
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-quote-comment") || null,
        renderHTML: (attrs) => ({ "data-quote-comment": attrs.commentId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-quote-comment]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "qc-mark" }, HTMLAttributes), 0];
  },
});

/**
 * 计算 container 内选区的纯文本偏移锚（TextWalker，支持跨节点选区）
 * @param {HTMLElement} container 渲染容器（rich-view）
 * @returns {{start:number, end:number, text:string} | null}
 */
export function getSelectionAnchor(container) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let start = -1;
  let end = -1;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeStart = offset;
    offset += node.nodeValue.length;
    if (node === range.startContainer) start = nodeStart + range.startOffset;
    if (node === range.endContainer) end = nodeStart + range.endOffset;
  }
  if (start === -1 || end === -1 || start >= end) return null;
  const text = container.textContent.slice(start, end);
  return { start, end, text };
}

/**
 * 在已渲染 DOM 上给 [start,end) 纯文本区间包裹引用 span（阅读模式即时高亮）
 * 跨节点选区会产出多个同 id 的分片 span，视觉连续
 * @param {HTMLElement} container
 * @param {{start:number, end:number}} anchor
 * @param {string} commentId
 */
export function applyQuoteToDom(container, anchor, commentId) {
  const target = findTextRange(container, anchor.start, anchor.end);
  if (!target) return false;
  for (const { node, s, e } of target.parts) {
    const wrap = document.createElement("span");
    wrap.setAttribute("data-quote-comment", commentId);
    wrap.className = "qc-mark";
    let node2 = node;
    if (s > 0) node2 = node.splitText(s);
    if (e - s < node2.nodeValue.length) node2.splitText(e - s);
    node2.parentNode.insertBefore(wrap, node2);
    wrap.appendChild(node2);
  }
  return true;
}

/**
 * 在 HTML 字符串上包裹引用 span（持久化文档内容用）
 * 实现：临时 DOM 复用 applyQuoteToDom，再序列化
 * @returns {string} 新 HTML
 */
export function wrapQuoteInHtml(html, anchor, commentId) {
  const host = document.createElement("div");
  host.innerHTML = html || "";
  const ok = applyQuoteToDom(host, anchor, commentId);
  return ok ? host.innerHTML : html;
}

/**
 * 定位纯文本偏移区间对应的文本节点分片
 * @returns {{parts: Array<{node: Text, s:number, e:number}>, hit: boolean}}
 */
function findTextRange(container, start, end) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const parts = [];
  let offset = 0;
  let hit = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeStart = offset;
    const nodeEnd = offset + node.nodeValue.length;
    offset = nodeEnd;
    if (nodeEnd <= start) continue; // 完全在区间前
    if (nodeStart >= end) break;    // 完全在区间后
    hit = true;
    const s = Math.max(0, start - nodeStart);
    const e = Math.min(node.nodeValue.length, end - nodeStart);
    if (e > s) parts.push({ node, s, e });
  }
  return { parts, hit };
}

/**
 * 点击正文高亮反查：事件目标向上找引用 span
 * @returns {string | null} commentId
 */
export function quoteIdFromEvent(e) {
  const el = e.target?.closest?.("[data-quote-comment]");
  return el ? el.getAttribute("data-quote-comment") : null;
}
