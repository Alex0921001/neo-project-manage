/**
 * 版本对比引擎（V2.6）：块级 LCS 对齐 + 块内字符级 diff，不引第三方依赖
 *
 * - htmlToBlocks：HTML 解析为块序列（段落/标题/列表项/引用/表格行/分隔线）
 * - diffBlocks：LCS 对齐产出 same/add/del 操作序列
 * - charDiff：两段文本字符级 LCS → 行内 ins/del 标记
 * - renderDiffHtml：把 ops 渲染成对比视图 HTML（del 块与相邻 add 块合并为「修改」行内 diff）
 */

/** HTML → 块序列 [{tag, text}]（块取纯文本；空块跳过） */
export function htmlToBlocks(html) {
  const host = document.createElement("div");
  host.innerHTML = html || "";
  const blocks = [];
  const push = (tag, el) => {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    blocks.push({ tag, text });
  };
  const walk = (el) => {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "blockquote" || tag === "pre") {
        push(tag, child);
      } else if (tag === "ul" || tag === "ol") {
        for (const li of child.children) push("li", li);
      } else if (tag === "table") {
        for (const tr of child.querySelectorAll("tr")) push("tr", tr);
      } else if (tag === "hr") {
        blocks.push({ tag: "hr", text: "" });
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
 * @returns {Array<{type:'same'|'add'|'del', block:{tag,text}}>}
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

/** 字符级 diff → HTML（ins/del 标记） */
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

/**
 * 版本对比 → 渲染 HTML
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
      rows.push(`<div class="vd-row vd-same">${ESC(op.block.text)}</div>`);
    } else if (op.type === "del") {
      // del 后紧跟 add 且同为小段 → 合并为「修改」行内 diff
      const nxt = ops[k + 1];
      if (nxt && nxt.type === "add") {
        rows.push(
          `<div class="vd-row vd-mod"><span class="vd-tag">改</span>${charDiffHtml(op.block.text, nxt.block.text)}</div>`
        );
        k++;
      } else {
        rows.push(`<div class="vd-row vd-del-row"><span class="vd-tag">删</span>${ESC(op.block.text)}</div>`);
      }
    } else {
      rows.push(`<div class="vd-row vd-add-row"><span class="vd-tag">增</span>${ESC(op.block.text)}</div>`);
    }
  }
  return { titleHtml, bodyHtml: rows.join(""), same: !titleHtml && rows.length === 0 };
}
