<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="float-panel"
      :style="panelStyle"
    >
      <!-- 标题栏：拖动区域（点 × 关闭；无遮罩，点击外部不关闭） -->
      <div
        class="float-panel-head"
        :class="{ 'float-panel-dragging': dragging }"
        @mousedown="startDrag"
      >
        <span class="float-panel-title">{{ title }}</span>
        <button class="float-panel-close" title="关闭" @click="close">✕</button>
      </div>
      <!-- 内容区（slot） -->
      <div class="float-panel-body" :class="{ 'float-panel-no-select': dragging || resizing }">
        <slot />
      </div>
      <!-- 右下角缩放柄 -->
      <div class="float-panel-resize" :class="{ 'float-panel-resizing': resizing }" @mousedown="startResize"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { nextZIndex } from "../utils/zIndex.js";

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

const panelStyle = computed(() => ({
  width: size.value.w + "px",
  height: size.value.h + "px",
  left: pos.value.x + "px",
  top: pos.value.y + "px",
  zIndex: zIndex.value || 3000,
}));

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
  if (!v) return;
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
  zIndex.value = nextZIndex();
});

function close() {
  emit("update:modelValue", false);
  emit("close");
}

// ===== 拖动（标题栏） =====
function startDrag(e) {
  if (e.button !== 0) return;
  dragging.value = true;
  const startX = e.clientX;
  const startY = e.clientY;
  const orig = { ...pos.value };
  const onMove = (ev) => {
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

// ===== 缩放（右下角柄，尺寸钳制在 [min, max]） =====
function startResize(e) {
  if (e.button !== 0) return;
  resizing.value = true;
  const startX = e.clientX;
  const startY = e.clientY;
  const orig = { ...size.value };
  const onMove = (ev) => {
    size.value = {
      w: clamp(orig.w + ev.clientX - startX, props.minWidth, props.maxWidth),
      h: clamp(orig.h + ev.clientY - startY, props.minHeight, props.maxHeight),
    };
    // 3.3：宽度变化事件透传（供大屏 <500px 自动收起任务树等响应式逻辑）
    emit("resize", { width: size.value.w, height: size.value.h });
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
.float-panel-no-select {
  user-select: none;
}
.float-panel-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  z-index: 5;
}
.float-panel-resize::after {
  content: "";
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--border);
  border-bottom: 2px solid var(--border);
}
.float-panel-resizing {
  cursor: nwse-resize;
}
</style>
