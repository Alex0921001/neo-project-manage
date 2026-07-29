/**
 * 格式化描述文本用于显示：
 * - 如果是 HTML（来自 contenteditable），按 HTML 原样渲染
 * - 如果是纯文本（来自 textarea），将换行转 <br>，空行转连续 <br>
 * - escape 掉可能的危险 HTML 字符后再插入 <br>，避免 XSS
 *
 * 注意：这里假设来源可信（当前项目是单用户本机插件），但仍然 escape
 * 用户手动输入的 `<script>` 之类字符，避免误渲染。
 */
export function formatDescription(text) {
  if (!text) return "";
  // 简单启发式：如果包含明显的 HTML 块级标签，原样输出
  if (/(<\/?(?:p|div|br|ul|ol|li|h[1-6]|strong|em|u|b|i)\b)/i.test(text)) {
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