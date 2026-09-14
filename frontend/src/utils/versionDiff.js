/**
 * 版本对比引擎 v2：白底双栏、全文渲染、修改行左右对齐
 *
 * - htmlToBlocks：HTML 解析为结构化块序列（保留标题/列表/表格 DOM，不降级纯文本）
 * - diffBlocks：LCS 对齐产出 same/add/del 操作序列
 * - charDiff：字符级 LCS → 行内 ins/del 标记
 * - renderDiffHtml：del 与相邻 add 配对合并为 mod 行（左旧右新同屏对齐）；
 *   未配对的 del/add 各占一行，空侧留占位
 */

/** HTML → 结构化块序列。每块 { kind, html }，html 为该块的原始子 HTML（保结构）。 */
export function htmlToBlocks(html) {
  const host = document.createElement("div");
  host.innerHTML = html || "";
  const blocks = [];
  const push = (kind, el) => {
    if (!el) return;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text || kind === "hr") blocks.push({ kind, html: el.outerHTML, text });
  };
  const walk = (el) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "blockquote" || tag === "pre") {
        push(tag, child);
      } else if (tag === "ul" || tag === "ol") {
        for (const li of child.children) push("li", li);
      } else if (tag === "table") {
        push("table", child);
      } else if (tag === "hr") {
        blocks.push({ kind: "hr", html: child.outerHTML, text: "" });
      } else {
        walk(child); // 容器级嵌套继续下钻
      }
    }
  };
  walk(host);
  // 富文本编辑器常见首尾空段，过滤空块保持对比聚焦
  return blocks.filter((b) => b.text);
}

/** LCS（两序列长度和 ≤ ~600 时可用全量矩阵；超出降级为基于锚点的简易对齐防内存爆炸） */
function lcsMatrix(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/**
 * 块级 diff：LCS 对齐
 * @returns {Array<{type:'same'|'add'|'del', block:{kind,html,text}}>}
 */
export function diffBlocks(a, b) {
  const at = a.map((x) => x.text);
  const bt = b.map((x) => x.text);
  const ops = [];
  if (at.length * bt.length > 360000) {
    // 降级：前后公共锚点对齐，中间整体 del+add
    let s = 0;
    while (s < at.length && s < bt.length && at[s] === bt[s]) s++;
    let ea = at.length;
    let eb = bt.length;
    while (ea > s && eb > s && at[ea - 1] === bt[eb - 1]) { ea--; eb--; }
    for (let i = 0; i < s; i++) ops.push({ type: "same", block: a[i] });
    for (let i = s; i < ea; i++) ops.push({ type: "del", block: a[i] });
    for (let j = s; j < eb; j++) ops.push({ type: "add", block: b[j] });
    for (let i = ea; i < at.length; i++) ops.push({ type: "same", block: a[i] });
    return ops;
  }
  const dp = lcsMatrix(at, bt);
  let i = 0;
  let j = 0;
  while (i < at.length && j < bt.length) {
    if (at[i] === bt[j]) { ops.push({ type: "same", block: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: "del", block: a[i] }); i++; }
    else { ops.push({ type: "add", block: b[j] }); j++; }
  }
  while (i < at.length) { ops.push({ type: "del", block: a[i] }); i++; }
  while (j < bt.length) { ops.push({ type: "add", block: b[j] }); j++; }
  return ops;
}

const ESC = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 字符级 diff：返回 [{t:'same'|'del'|'add', text}] */
export function charDiff(a, b) {
  const dp = lcsMatrix([...a], [...b]);
  const out = [];
  let i = 0;
  let j = 0;
  const push = (t, ch) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.text += ch;
    else out.push({ t, text: ch });
  };
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]); i++; }
    else { push("add", b[j]); j++; }
  }
  while (i < a.length) { push("del", a[i]); i++; }
  while (j < b.length) { push("add", b[j]); j++; }
  return out;
}

/** 字符级 diff → 行内 HTML（ins/del 词块） */
export function charDiffHtml(a, b) {
  return charDiff(a, b)
    .map((p) =>
      p.t === "same" ? ESC(p.text)
        : p.t === "del" ? `<del class="vd-del">${ESC(p.text)}</del>`
        : `<ins class="vd-add">${ESC(p.text)}</ins>`
    )
    .join("");
}

/** 纯文本简单 diff（标题用）：无差异返回 null */
export function simpleDiffHtml(a, b) {
  if (a === b) return null;
  return charDiffHtml(a, b);
}

/** 表格 HTML：按行拆出结构化行（含单元格文本数组），供行级 diff */
function tableRows(tableHtml) {
  const host = document.createElement("div");
  host.innerHTML = tableHtml;
  const rows = [];
  for (const tr of host.querySelectorAll("tr")) {
    const cells = [...tr.children].map((td) => (td.textContent || "").replace(/\s+/g, " ").trim());
    rows.push({ html: tr.outerHTML, cells, key: cells.join("|") });
  }
  return rows;
}

/** 表格块渲染：对齐两版行，未变行白底、仅新行绿底、仅旧行红底（按 diffBlocks 对齐） */
function renderTableDiff(oldTableHtml, newTableHtml) {
  const rowsA = tableRows(oldTableHtml);
  const rowsB = tableRows(newTableHtml);
  const ops = diffBlocks(
    rowsA.map((r) => ({ kind: "tr", html: r.html, text: r.key })),
    rowsB.map((r) => ({ kind: "tr", html: r.html, text: r.key }))
  );
  const rowHtml = (html, cls) => html.replace(/^<tr/, `<tr class="${cls}"`);
  const out = ["<table class=\"vd-table\">"];
  for (const op of ops) {
    const cls = op.type === "add" ? "vd-tr-add" : op.type === "del" ? "vd-tr-del" : "";
    out.push(rowHtml(op.block.html, cls));
  }
  out.push("</table>");
  return out.join("");
}

/**
 * 版本对比 → 双栏渲染 HTML
 * 输出行结构（每行固定两格，左旧右新）：
 *   <div class="vd-row vd-same"><div class="vd-cell vd-l">..</div><div class="vd-cell vd-r">..</div></div>
 *   mod:  左=旧句(行内 del 词块)  右=新句(行内 ins 词块)
 *   del:  左=旧块红底            右=空占位
 *   add:  左=空占位              右=新块绿底
 * 表格块走 renderTableDiff（结构保留 + 行级标色）。
 * @param {{title:string, content:string, extra:object}} va 基线（旧）
 * @param {{title:string, content:string, extra:object}} vb 对比（新）
 * @returns {{titleHtml: string, bodyHtml: string, same: boolean}}
 */
export function renderDiff(va, vb) {
  const titleHtml = simpleDiffHtml(va?.title || "", vb?.title || "");
  const blocksA = htmlToBlocks(va?.content || "");
  const blocksB = htmlToBlocks(vb?.content || "");
  const ops = diffBlocks(blocksA, blocksB);

  const rows = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === "same") {
      const body = op.block.html;
      rows.push(`<div class="vd-row vd-same"><div class="vd-cell vd-l">${body}</div><div class="vd-cell vd-r">${body}</div></div>`);
    } else if (op.type === "del") {
      const nxt = ops[k + 1];
      if (nxt && nxt.type === "add") {
        // 配对：修改行，左旧右新同屏
        if (op.block.kind === "table") {
          const t = renderTableDiff(op.block.html, nxt.block.html);
          rows.push(`<div class="vd-row vd-mod"><div class="vd-cell vd-l vd-mod-l">${t}</div><div class="vd-cell vd-r vd-mod-r">${t}</div></div>`);
        } else {
          const inline = charDiffHtml(op.block.text, nxt.block.text);
          rows.push(`<div class="vd-row vd-mod"><div class="vd-cell vd-l vd-mod-l">${inline}</div><div class="vd-cell vd-r vd-mod-r">${inline}</div></div>`);
        }
        k++;
      } else {
        rows.push(`<div class="vd-row vd-del"><div class="vd-cell vd-l">${op.block.html}</div><div class="vd-cell vd-r"></div></div>`);
      }
    } else {
      rows.push(`<div class="vd-row vd-add"><div class="vd-cell vd-l"></div><div class="vd-cell vd-r">${op.block.html}</div></div>`);
    }
  }
  return { titleHtml, bodyHtml: rows.join(""), same: !titleHtml && rows.length === 0 };
}
