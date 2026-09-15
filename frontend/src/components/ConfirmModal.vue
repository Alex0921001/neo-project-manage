<template>
  <Teleport to="body">
    <div v-if="show" ref="overlayEl" class="cm-overlay" :style="{ zIndex: overlayZ }" popover="manual">
      <div class="cm-dialog" role="alertdialog" aria-modal="true">
        <div class="cm-title">{{ title }}</div>
        <p class="cm-body">{{ message }}</p>
        <div class="cm-footer">
          <button type="button" class="cm-btn" @click="$emit('close')">{{ cancelText }}</button>
          <button type="button" class="cm-btn cm-btn-danger" @click="$emit('confirm')">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { nextZIndex } from "../utils/zIndex.js";

const props = defineProps({
  show: Boolean,
  message: { type: String, default: "" },
  confirmText: { type: String, default: "确认删除" },
  cancelText: { type: String, default: "取消" },
  title: { type: String, default: "确认" },
  // 编程式调用（utils/confirm.js 单例）时传入实际层级；模板用法传空则自行取号
  z: { type: Number, default: 0 },
});
const emit = defineEmits(["close", "confirm"]);

// 自研弹层（替代 el-dialog）：与 FloatPanel 共用 zIndex.js 统一计数器。
// 层级：编程式由外部传入（confirm.js 统一取号 + enforceTop 兜底）；模板式打开时自行取号
const ownZ = ref(0);
const overlayZ = computed(() => props.z || ownZ.value);
const overlayEl = ref(null);

// ===== Top Layer 保证（终极兜底）=====
// Popover API（Chromium 114+）：showPopover() 把遮罩提升进浏览器 top layer，
// 渲染在文档一切内容（含任意 z-index 的浮动面板）之上，与 z-index 彻底无关。
// 旧内核不支持时自动降级为 z-index 路径（元素上保留 popover 属性但 UA 样式会
// display:none —— 必须在不支持的环境移除该属性，否则遮罩永远不可见）。
const canPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

watch(() => props.show, (v) => {
  if (v && !props.z) ownZ.value = nextZIndex();
  nextTick(() => {
    const el = overlayEl.value;
    if (!el) return;
    if (canPopover) {
      try {
        if (!el.matches(":popover-open")) el.showPopover();
      } catch { /* ignore */ }
      // showPopover 失败（异常/未进入 top layer）时摘掉 popover 属性，避免 UA 的
      // display:none 把遮罩藏成不可见，降级回 z-index 渲染
      if (!el.matches(":popover-open")) el.removeAttribute("popover");
    }
    // 诊断输出：遮罩与所有已开面板的实际层级（出问题时 F12 一眼定位）
    const panels = [...document.querySelectorAll(".float-panel")].map((p) => ({
      z: parseInt(window.getComputedStyle(p).zIndex, 10) || 0,
      title: p.querySelector(".float-panel-title")?.textContent || "",
    }));
    console.info("[confirm] overlay z =", overlayZ.value, "panels =", JSON.stringify(panels), "topLayer =", canPopover && !!el.matches?.(":popover-open"));
  });
});

// Esc 取消：捕获阶段拦截并吞掉，不冒泡到 FloatPanel 的 Esc 关闭链（避免误关底层弹窗）
function onKeydown(e) {
  if (!props.show || e.key !== "Escape") return;
  e.stopPropagation();
  e.preventDefault();
  emit("close");
}
document.addEventListener("keydown", onKeydown, true);
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown, true);
  // 单例卸载时若仍在 top layer，退出（v-if 移除元素时浏览器自动收栈，此处仅保险）
  try { overlayEl.value?.hidePopover?.(); } catch { /* ignore */ }
});
</script>

<style scoped>
.cm-overlay {
  position: fixed;
  inset: 0;
  /* 显式覆盖 Chromium UA 对 [popover] 的默认样式：fit-content / border / padding /
     overflow:auto，否则遮罩会被缩成左上角一个带黑边的盒子 */
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  border: none;
  padding: 0;
  overflow: visible;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* popover 打开态覆盖 UA 的 display:none（Chromium 会注入 [popover] UA 规则） */
.cm-overlay:popover-open {
  display: flex;
}
.cm-dialog {
  width: 360px;
  box-sizing: border-box;
  background: var(--bg-card, var(--bg));
  border: 0.5px solid var(--border);
  border-radius: 10px;
  padding: 15px 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
.cm-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.cm-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  margin: 10px 0 14px;
  white-space: pre-line;
  word-break: break-word;
}
.cm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.cm-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: 0.5px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}
.cm-btn:hover { border-color: var(--text); }
.cm-btn-danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.cm-btn-danger:hover { filter: brightness(1.08); border-color: var(--danger); }
</style>
