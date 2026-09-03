/**
 * 划词引用选区气泡（V2.6）
 * 用法：
 *   const { bubble, onSelectionMouseup, takeAnchor, hideBubble } = useQuoteSelection(containerRef);
 *   <div ref="containerRef" @mouseup="onSelectionMouseup">…</div>
 *   <div v-if="bubble" class="quote-bubble" :style="{ left: bubble.x+'px', top: bubble.y+'px' }">
 *     <button @click="onQuoteClick">引用</button>
 *   </div>
 * 需求：容器 position:relative；气泡内点击后调 hideBubble()。
 *
 * 多击防抖：浏览器双击/三击的选区是分步扩展的（词 → 段落），每次 mouseup 都立即
 * 计算会让气泡在中间态闪烁（出现又消失）。改为 mouseup 后延迟 180ms 等选区稳定
 * 再计算锚点；期间任何 mousedown（新选择开始）都会取消等待并收起气泡。
 */
import { ref, onBeforeUnmount } from "vue";
import { getSelectionAnchor } from "./quoteComment.js";

export function useQuoteSelection(containerRef, { enabled } = {}) {
  const bubble = ref(null); // { x, y }
  let pendingAnchor = null;
  let stableTimer = null;

  function onMouseDownDocument(e) {
    // 点气泡自身不收起（否则引用按钮点不到）
    if (e.target.closest?.(".quote-bubble")) return;
    hideBubble();
  }
  document.addEventListener("mousedown", onMouseDownDocument, true);
  onBeforeUnmount(() => {
    document.removeEventListener("mousedown", onMouseDownDocument, true);
    if (stableTimer) clearTimeout(stableTimer);
  });

  function onSelectionMouseup(e) {
    // 点在气泡自身上不重算
    if (e.target.closest?.(".quote-bubble")) return;
    hideBubble();
    if (enabled && !enabled()) return;
    const container = containerRef.value;
    if (!container) return;
    // 防抖：等浏览器完成多击选区扩展后再计算
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = setTimeout(() => {
      stableTimer = null;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const anchor = getSelectionAnchor(container);
      if (!anchor) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const host = container.getBoundingClientRect();
      pendingAnchor = anchor;
      // 气泡置于选区上方居中（贴近视口顶部时翻转到下方）
      const x = Math.max(0, rect.left - host.left + rect.width / 2 - 28);
      const y = rect.top - host.top < 40 ? rect.bottom - host.top + 6 : rect.top - host.top - 34;
      bubble.value = { x, y };
    }, 180);
  }

  function takeAnchor() {
    const a = pendingAnchor;
    pendingAnchor = null;
    bubble.value = null;
    window.getSelection()?.removeAllRanges?.();
    return a;
  }

  function hideBubble() {
    if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
    bubble.value = null;
    pendingAnchor = null;
  }

  return { bubble, onSelectionMouseup, takeAnchor, hideBubble };
}
