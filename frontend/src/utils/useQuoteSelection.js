/**
 * 划词引用选区气泡（V2.6）
 * 用法：
 *   const { bubble, onSelectionMouseup, takeAnchor, hideBubble } = useQuoteSelection(containerRef);
 *   <div ref="containerRef" @mouseup="onSelectionMouseup">…</div>
 *   <div v-if="bubble" class="quote-bubble" :style="{ left: bubble.x+'px', top: bubble.y+'px' }">
 *     <button @click="onQuoteClick">引用</button>
 *   </div>
 * 需求：容器 position:relative；气泡内点击后调 hideBubble()。
 */
import { ref, onScopeDispose } from "vue";
import { getSelectionAnchor } from "./quoteComment.js";

export function useQuoteSelection(containerRef, { enabled } = {}) {
  const bubble = ref(null); // { x, y }
  let pendingAnchor = null;

  function onSelectionMouseup(e) {
    // 点在气泡自身上不重算
    if (e.target.closest?.(".quote-bubble")) return;
    bubble.value = null;
    pendingAnchor = null;
    if (enabled && !enabled()) return;
    const container = containerRef.value;
    if (!container) return;
    const anchor = getSelectionAnchor(container);
    if (!anchor) return;
    const sel = window.getSelection();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const host = container.getBoundingClientRect();
    pendingAnchor = anchor;
    // 气泡置于选区上方居中（贴近视口顶部时翻转到下方）
    const x = Math.max(0, rect.left - host.left + rect.width / 2 - 28);
    const y = rect.top - host.top < 40 ? rect.bottom - host.top + 6 : rect.top - host.top - 34;
    bubble.value = { x, y };
  }

  function takeAnchor() {
    const a = pendingAnchor;
    pendingAnchor = null;
    bubble.value = null;
    window.getSelection()?.removeAllRanges?.();
    return a;
  }

  function hideBubble() {
    bubble.value = null;
    pendingAnchor = null;
  }

  // 气泡显隐与选区联动（V2.6.1）：选区被清空或点击容器外 → 气泡立即隐藏，
  // 避免「气泡悬空指向已不存在的选区」（容器内的点击仍由 mouseup 逻辑重算）
  function onDocSelectionChange() {
    const sel = window.getSelection();
    if ((!sel || sel.isCollapsed) && bubble.value) hideBubble();
  }
  function onDocPointerDown(e) {
    if (e.target.closest?.(".quote-bubble")) return;
    if (containerRef.value?.contains(e.target)) return;
    hideBubble();
  }
  window.addEventListener("selectionchange", onDocSelectionChange);
  window.addEventListener("pointerdown", onDocPointerDown, true);
  onScopeDispose(() => {
    window.removeEventListener("selectionchange", onDocSelectionChange);
    window.removeEventListener("pointerdown", onDocPointerDown, true);
  });

  return { bubble, onSelectionMouseup, takeAnchor, hideBubble };
}
