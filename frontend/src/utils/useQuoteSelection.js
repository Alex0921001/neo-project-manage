/**
 * 划词引用选区气泡（V2.6）
 *
 * 监听 document selectionchange（有选中 → 显示气泡，折叠 → 隐藏），
 * 覆盖单击拖选 / 双击选词 / 三击选段所有路径，不再依赖 mouseup 时序。
 *
 * 用法：
 *   const { bubble, takeAnchor, hideBubble } = useQuoteSelection(containerRef);
 *   <div ref="containerRef">…</div>
 *   <div v-if="bubble" class="quote-bubble" :style="{ left: bubble.x+'px', top: bubble.y+'px' }">
 *     <button @mousedown.prevent @click="onQuoteClick">引用</button>
 *   </div>
 * 注意：
 * - 容器 position:relative；气泡 absolute 定位在容器内，位置计算含滚动补偿
 * - 气泡按钮必须 @mousedown.prevent（防止点击时选区被折叠触发隐藏）
 */
import { ref, onBeforeUnmount } from "vue";
import { getSelectionAnchor } from "./quoteComment.js";

const BUBBLE_H = 30; // 气泡高度（含 padding）
const GAP = 8;       // 与选中文字的呼吸距离

export function useQuoteSelection(containerRef, { enabled } = {}) {
  const bubble = ref(null); // { x, y }
  let pendingAnchor = null;
  let changeTimer = null;

  function compute() {
    bubble.value = null;
    pendingAnchor = null;
    if (enabled && !enabled()) return;
    const container = containerRef.value;
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const anchor = getSelectionAnchor(container);
    if (!anchor) return;
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    const host = container.getBoundingClientRect();
    pendingAnchor = anchor;
    // 气泡 absolute 在滚动容器内：视口差值 + 容器滚动补偿
    const x = Math.max(0, rect.left - host.left + container.scrollLeft + rect.width / 2 - 28);
    const above = rect.top - host.top + container.scrollTop - BUBBLE_H - GAP;
    // 选区贴容器顶部放不下时翻转到下方
    const y = above < 0 ? rect.bottom - host.top + container.scrollTop + GAP : above;
    bubble.value = { x, y };
  }

  function onSelectionChange() {
    // 轻防抖：等浏览器完成多击选区扩展/收尾再计算
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(compute, 120);
  }

  document.addEventListener("selectionchange", onSelectionChange);
  // 三击选段保险：浏览器在 mousedown(detail=3) 时立即扩展为段落选区，跳过防抖即时显示
  function onMouseDown(e) {
    if (e.target.closest?.(".quote-bubble")) return;
    if (e.detail === 3) {
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = setTimeout(compute, 60);
    }
  }
  document.addEventListener("mousedown", onMouseDown, true);
  onBeforeUnmount(() => {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("mousedown", onMouseDown, true);
    if (changeTimer) clearTimeout(changeTimer);
  });

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

  return { bubble, takeAnchor, hideBubble };
}
