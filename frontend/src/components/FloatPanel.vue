<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="float-panel"
      :class="{ 'float-panel-full-state': fullscreen }"
      :style="panelStyle"
    >
      <!-- 标题栏：拖动区域（点 × 关闭；双击标题撑满整页；无遮罩，点击外部不关闭） -->
      <div
        class="float-panel-head"
        :class="{ 'float-panel-dragging': dragging, 'float-panel-fullscreen': fullscreen }"
        @mousedown="startDrag"
        @dblclick="toggleFullscreen"
      >
        <span class="float-panel-title">{{ title }}</span>
        <button class="float-panel-close" title="关闭" @click="close">✕</button>
      </div>
      <!-- 内容区（slot） -->
      <div class="float-panel-body" :class="{ 'float-panel-no-select': dragging || resizing }">
        <slot />
      </div>
      <!-- 底部操作区（可选，表单弹窗用） -->
      <div v-if="$slots.footer" class="float-panel-footer">
        <slot name="footer" />
      </div>
      <!-- 八方向缩放柄（Windows 窗口式）：四边 + 四角 -->
      <div
        v-for="d in ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']"
        :key="d"
        :class="['float-panel-edge', 'fp-edge-' + d]"
        @mousedown="startResize($event, d)"
      ></div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { nextZIndex } from "../utils/zIndex.js";

// 已打开面板的 zIndex 栈：Esc 只关最上层，避免多弹窗叠加时一按全关
const openStack = [];

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "" },
  defaultWidth: { type: Number, default: 960 },
  defaultHeight: { type: Number, default: 560 },
  minWidth: { type: Number, default: 480 },
  minHeight: { type: Number, default: 320 },
  maxWidth: { type: Number, default: 1920 },
  maxHeight: { type: Number, default: 1080 },
});
const emit = defineEmits(["update:modelValue", "close", "resize"]);

const pos = ref({ x: 0, y: 0 });
const size = ref({ w: props.defaultWidth, h: props.defaultHeight });
const dragging = ref(false);
const resizing = ref(false);
// 打开时动态取层级（后打开的面板/弹窗永远更高）
const zIndex = ref(0);
// 双击标题栏撑满整页：记住进入全屏前的尺寸/位置，恢复用
const fullscreen = ref(false);
const prevRect = ref(null);

const panelStyle = computed(() => {
  if (fullscreen.value) {
    return {
      width: "100vw",
      height: "100vh",
      left: 0,
      top: 0,
      zIndex: zIndex.value || 3000,
    };
  }
  return {
    width: size.value.w + "px",
    height: size.value.h + "px",
    left: pos.value.x + "px",
    top: pos.value.y + "px",
    zIndex: zIndex.value || 3000,
  };
});

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// 居中定位（视口内，顶部略偏上）
function center() {
  pos.value = {
    x: Math.max(0, Math.round((window.innerWidth - size.value.w) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - size.value.h) / 2) - 24),
  };
}

// 打开时：首次打开居中；后续打开位置不可见（视口变化/拖出）才重新居中，否则保持上次位置
let positioned = false;
watch(() => props.modelValue, (v) => {
  if (!v) {
    // 关闭：从打开栈移除自己
    const i = openStack.indexOf(zIndex.value);
    if (i >= 0) openStack.splice(i, 1);
    return;
  }
  if (!positioned) {
    center();
    positioned = true;
  } else {
    const maxX = window.innerWidth - 60;
    const maxY = window.innerHeight - 44;
    if (pos.value.x < 0 || pos.value.y < 0 || pos.value.x > maxX || pos.value.y > maxY) {
      center();
    }
  }
  // 重新打开时重置全屏，回到默认尺寸
  fullscreen.value = false;
  prevRect.value = null;
  zIndex.value = nextZIndex();
  openStack.push(zIndex.value);
});

// ===== Esc 关闭弹窗 =====
// 输入控件内（INPUT/TEXTAREA/contentEditable）的 Esc 由局部逻辑优先（如临时任务编辑态取消），不关弹窗；
// 多弹窗叠加时只关最上层
function onPanelKeydown(e) {
  if (e.key !== "Escape" || !props.modelValue) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (openStack[openStack.length - 1] !== zIndex.value) return;
  close();
}
onMounted(() => document.addEventListener("keydown", onPanelKeydown));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onPanelKeydown);
  const i = openStack.indexOf(zIndex.value);
  if (i >= 0) openStack.splice(i, 1);
});

function close() {
  emit("update:modelValue", false);
  emit("close");
}

// ===== 双击标题栏：撑满整页 / 恢复 =====
function toggleFullscreen() {
  if (fullscreen.value) {
    // 恢复：回到进入全屏前的尺寸与位置
    fullscreen.value = false;
    if (prevRect.value) {
      size.value = { w: prevRect.value.w, h: prevRect.value.h };
      pos.value = { x: prevRect.value.x, y: prevRect.value.y };
    }
    prevRect.value = null;
  } else {
    prevRect.value = { w: size.value.w, h: size.value.h, x: pos.value.x, y: pos.value.y };
    fullscreen.value = true;
  }
}

// ===== 拖动（标题栏）；全屏态拖动 = 退出全屏并恢复原尺寸，跟随鼠标继续拖 =====
function startDrag(e) {
  if (e.button !== 0) return;
  dragging.value = true;
  const startX = e.clientX;
  const startY = e.clientY;
  let orig = { ...pos.value };
  const onMove = (ev) => {
    if (fullscreen.value) {
      // 移动超过阈值才退出全屏（纯点击/双击不触发，交给 dblclick 恢复，避免冲突）
      if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
      fullscreen.value = false;
      if (prevRect.value) {
        size.value = { w: prevRect.value.w, h: prevRect.value.h };
        // 保持鼠标相对抓取位置：按全屏时的横向比例定位，纵向标题栏贴鼠标
        const ratio = clamp(startX / window.innerWidth, 0, 1);
        pos.value = {
          x: Math.round(ev.clientX - ratio * size.value.w),
          y: Math.max(0, ev.clientY - 16),
        };
        prevRect.value = null;
      } else {
        center();
      }
      orig = { ...pos.value };
    }
    // 水平可拖出大部分（留 20px 便于拖回）；垂直顶边不越出视口（标题栏始终可抓）
    pos.value = {
      x: clamp(orig.x + ev.clientX - startX, 20 - size.value.w, window.innerWidth - 20),
      y: clamp(orig.y + ev.clientY - startY, 0, window.innerHeight - 32),
    };
  };
  const onUp = () => {
    dragging.value = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  e.preventDefault();
}

// ===== 缩放（Windows 窗口式：四边 + 四角，尺寸钳制在 [min, max]） =====
function startResize(e, dir = "se") {
  if (e.button !== 0) return;
  if (fullscreen.value) return;
  resizing.value = true;
  const startX = e.clientX;
  const startY = e.clientY;
  const origSize = { ...size.value };
  const origPos = { ...pos.value };
  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let w = origSize.w;
    let h = origSize.h;
    if (dir.includes("e")) w = clamp(origSize.w + dx, props.minWidth, props.maxWidth);
    if (dir.includes("s")) h = clamp(origSize.h + dy, props.minHeight, props.maxHeight);
    if (dir.includes("w")) {
      w = clamp(origSize.w - dx, props.minWidth, props.maxWidth);
      // 尺寸被钳到 min 后位置回正，面板右边框跟随鼠标
      pos.value.x = origPos.x + (origSize.w - w);
    }
    if (dir.includes("n")) {
      h = clamp(origSize.h - dy, props.minHeight, props.maxHeight);
      pos.value.y = origPos.y + (origSize.h - h);
    }
    size.value = { w, h };
    // 3.3：宽度变化事件透传（供大屏 <500px 自动收起任务树等响应式逻辑）
    emit("resize", { width: w, height: h });
  };
  const onUp = () => {
    resizing.value = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  e.preventDefault();
}
</script>

<style scoped>
.float-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
/* 全屏态：去掉圆角与边框，铺满整页 */
.float-panel-full-state {
  border-radius: 0;
  border: none;
}
.float-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 8px 14px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}
.float-panel-dragging {
  cursor: grabbing;
}
.float-panel-fullscreen {
  cursor: default;
}
.float-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.float-panel-close {
  width: 24px; height: 24px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.float-panel-close:hover {
  background: var(--bg-hover);
  color: var(--danger);
  border-color: var(--danger);
}
.float-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.float-panel-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}
.float-panel-no-select {
  user-select: none;
}
.float-panel-edge {
  position: absolute;
  z-index: 6;
}
/* 四边：热区在内侧（面板 overflow:hidden 不裁切），左右留出四角 */
.fp-edge-n { top: 0; left: 10px; right: 10px; height: 5px; cursor: ns-resize; }
.fp-edge-s { bottom: 0; left: 10px; right: 10px; height: 5px; cursor: ns-resize; }
.fp-edge-e { right: 0; top: 10px; bottom: 10px; width: 5px; cursor: ew-resize; }
.fp-edge-w { left: 0; top: 10px; bottom: 10px; width: 5px; cursor: ew-resize; }
/* 四角：右下沿用原大热区（含视觉拖拽指示） */
.fp-edge-ne { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.fp-edge-nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.fp-edge-sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.fp-edge-se { bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; }
/* 右下角拖拽视觉指示（保留原右下柄的三角标记，纯装饰不拦截点击） */
.fp-edge-se::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--border);
  border-bottom: 2px solid var(--border);
}
</style>
