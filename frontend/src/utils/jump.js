/**
 * 搜索/消息跳转辅助（V2.3 R1/R2）
 *
 * 统一跳转协议：写入 sessionStorage 供项目详情页挂载时消费（跨页面场景），
 * 并派发 window 事件 neo-pm:jump（若已在目标项目页，由项目页直接处理，无需整页切换）。
 *
 * type 取值：project | task | annotation | plan | requirement | note | file
 * 目标行为：
 * - project → 打开对应项目页（App 层消费 projectId 切视图，无额外定位）
 * - task / annotation → 项目任务 tab + 滚动定位（批注定位到所属任务并打开批注面板）
 * - plan / requirement → 对应 tab + 打开详情弹窗
 * - note → 项目概览 tab（备注归属概览）
 * - file → 项目文件 tab
 */
export function jumpToResult({ type, projectId, refId }) {
  if (!type || !projectId || !refId) return;
  try {
    sessionStorage.setItem("neo-pm-jump", JSON.stringify({ type, projectId, refId, ts: Date.now() }));
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("neo-pm:jump", { detail: { type, projectId, refId } }));
}

/** 读取并清除跳转标记（项目详情页挂载时消费；跨页跳转专用） */
export function consumeJumpMark() {
  try {
    const raw = sessionStorage.getItem("neo-pm-jump");
    if (!raw) return null;
    sessionStorage.removeItem("neo-pm-jump");
    const j = JSON.parse(raw);
    return j && j.type && j.projectId && j.refId ? j : null;
  } catch {
    return null;
  }
}

/** FTS snippet 渲染：HTML 转义（防 XSS）后再还原 <mark> 高亮标签 */
export function renderSnippet(snip) {
  if (!snip) return "";
  return String(snip)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

/**
 * 标题命中词高亮（SearchPanel 标题行 / 消息中心过滤共用）：
 * HTML 转义防 XSS 后，把 keyword 命中位置包上 <mark>（样式与内容行 snippet 高亮一致）。
 * keyword 同样先做 HTML 转义再正则转义，保证特殊字符（< > & 等）可安全匹配转义后的文本。
 */
export function highlightKeyword(text, keyword) {
  const esc = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const kw = String(keyword || "").trim();
  if (!kw) return esc;
  const escKw = kw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return esc.replace(new RegExp(`(${escKw})`, "gi"), "<mark>$1</mark>");
}
