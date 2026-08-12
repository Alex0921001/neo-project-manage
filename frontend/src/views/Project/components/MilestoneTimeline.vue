<template>
  <div class="milestone-timeline">
    <div class="milestone-axis" ref="axisRef">      <!-- 波浪虚线（canvas 正弦波 + 虚线） -->
      <canvas ref="canvasRef" class="milestone-canvas" aria-hidden="true" />

      <!-- 左端：项目计划开始日期 -->
      <div class="timeline-endpoint timeline-endpoint-start">
        <span class="endpoint-dot" />
        <span class="endpoint-date">{{ startLabel }}</span>
      </div>
      <!-- 右端：项目计划结束日期 -->
      <div class="timeline-endpoint timeline-endpoint-end">
        <span class="endpoint-dot" />
        <span class="endpoint-date">{{ endLabel }}</span>
      </div>

      <!-- 里程碑节点（DOM 绝对定位，可点击 / 弹 popover） -->
      <div
        v-for="(g, gi) in groups"
        :key="gi"
        class="milestone-node"
        :class="{ 'milestone-node-multi': g.tasks.length > 1, 'milestone-node-nodate': !g.date }"
        :style="{ left: nodeLeft(g) + 'px' }"
        :title="g.date ? `里程碑 · ${g.date}` : '里程碑（未设置时间）'"
        @click.stop="onNodeClick(g, $event)"
      >
        <span class="milestone-flag">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </span>
        <div class="milestone-node-info">
          <div class="milestone-node-names">
            <template v-if="g.tasks.length === 1">
              <span class="milestone-node-name">{{ g.tasks[0].name }}</span>
            </template>
            <template v-else>
              <span v-for="t in g.tasks.slice(0, 2)" :key="t.id" class="milestone-node-name">{{ t.name }}</span>
              <span class="milestone-node-more">等{{ g.tasks.length - 2 }}个</span>
            </template>
          </div>
          <div class="milestone-node-date">{{ g.date ? shortDate(g.date) : '未设置时间' }}</div>
        </div>
      </div>
    </div>

    <!-- 多里程碑 popover（自定义浮层，z-index 由 nextZIndex 管理，teleport 到 body 避免被容器裁切） -->
    <teleport to="body">
      <div
        v-if="popover.show"
        class="milestone-popover"
        :style="{ left: popover.x + 'px', top: popover.y + 'px', zIndex: popover.z }"
        @click.stop
      >
        <div class="milestone-popover-title">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          <span>{{ popover.date || '未设置时间' }} · 全部里程碑</span>
        </div>
        <div class="milestone-popover-list">
          <div
            v-for="t in popover.tasks"
            :key="t.id"
            class="milestone-popover-item"
            title="点击定位到任务"
            @click="jump(t.id)"
          >
            <span class="milestone-popover-flag">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </span>
            <span class="milestone-popover-name">{{ t.name }}</span>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { nextZIndex } from "../../../utils/zIndex.js";

const props = defineProps({
  planStart: { type: String, default: "" },
  planEnd: { type: String, default: "" },
  // 扁平里程碑列表：{ id, name, startDate, createdAt }
  milestones: { type: Array, default: () => [] },
});
const emit = defineEmits(["jump-task"]);

// ===== 数据分组：按开始日期聚合，同日归一组；无时间节点排最后 =====
const groups = computed(() => {
  const byDate = new Map();
  const noDate = [];
  for (const m of props.milestones || []) {
    if (m.startDate) {
      if (!byDate.has(m.startDate)) byDate.set(m.startDate, []);
      byDate.get(m.startDate).push(m);
    } else {
      noDate.push(m);
    }
  }
  const list = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) // 日期升序
    .map(([date, tasks]) => ({ date, tasks }));
  if (noDate.length) list.push({ date: "", tasks: noDate }); // 无时间的排最后
  return list;
});

// ===== 端点兜底：优先项目计划起止，缺失时用里程碑日期范围 =====
const endpoints = computed(() => {
  let s = props.planStart || "";
  let e = props.planEnd || "";
  const dated = groups.value.filter((g) => g.date).map((g) => g.date);
  if (!s && dated.length) s = dated[0];
  if (!e && dated.length) e = dated[dated.length - 1];
  if (!s && !e) { s = ""; e = ""; }
  return { s, e };
});

const startLabel = computed(() => endpoints.value.s || "—");
const endLabel = computed(() => endpoints.value.e || "—");

const startT = computed(() => endpoints.value.s ? Date.parse(endpoints.value.s + "T00:00:00") : NaN);
const endT = computed(() => endpoints.value.e ? Date.parse(endpoints.value.e + "T00:00:00") : NaN);

// 时间跨度（天），两端相同或缺失时兜底 1 天避免除零
const spanMs = computed(() => {
  if (Number.isNaN(startT.value) || Number.isNaN(endT.value)) return 1;
  const d = endT.value - startT.value;
  return d > 0 ? d : 1;
});

// 轴左右留白（px）：给两端蓝点与极端位置节点留出空间
const PAD_X = 56;

// 节点横向位置：有时间的按比例定位，无时间的放轴右端
function nodeLeft(g) {
  const w = axisWidth.value;
  if (!w) return PAD_X;
  const lineStart = PAD_X;
  const lineEnd = Math.max(w - PAD_X, lineStart + 1);
  let pos;
  if (!g.date) {
    pos = 1; // 无时间 → 轴末尾（右端蓝点上方）
  } else {
    const t = Date.parse(g.date + "T00:00:00");
    pos = Math.min(1, Math.max(0, (t - startT.value) / spanMs.value));
  }
  return lineStart + pos * (lineEnd - lineStart);
}

function shortDate(d) {
  return d ? d.slice(5) : "";
}

// ===== canvas：波浪虚线（正弦波 + setLineDash）=====
const axisRef = ref(null);
const canvasRef = ref(null);
let resizeObserver = null;
// 轴容器当前宽度（响应式：resize 时更新，驱动节点位置重算）
const axisWidth = ref(0);

function updateAxisWidth() {
  axisWidth.value = axisRef.value ? axisRef.value.clientWidth : 0;
}

// resize 处理：更新宽度 + 重绘（命名引用，便于卸载时移除）
function onWindowResize() {
  updateAxisWidth();
  draw();
}

function readCssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function draw() {
  const canvas = canvasRef.value;
  const axis = axisRef.value;
  if (!canvas || !axis || !axis.clientWidth || !axis.clientHeight) return;
  const dpr = window.devicePixelRatio || 1;
  const w = axis.clientWidth;
  const h = axis.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const lineStart = PAD_X;
  const lineEnd = w - PAD_X;
  if (lineEnd <= lineStart) return;
  const cy = Math.round(h / 2) + 8; // 波浪线略偏下，旗子节点立于线上方

  ctx.strokeStyle = readCssVar("--border", "#d3d7de");
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  const amp = 3;       // 波幅（px）
  const period = 84;   // 波长（px）
  const step = 1.5;
  for (let x = lineStart; x <= lineEnd; x += step) {
    const y = cy + Math.sin(((x - lineStart) / period) * Math.PI * 2) * amp;
    if (x === lineStart) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// ===== popover（自定义浮层）=====
const popover = ref({ show: false, date: "", tasks: [], x: 0, y: 0, z: 0 });

function onNodeClick(g, ev) {
  if (g.tasks.length > 1) {
    openPopover(g, ev);
    return;
  }
  // 单节点：直接跳转
  jump(g.tasks[0].id);
}

function openPopover(g, ev) {
  const rect = ev.currentTarget.getBoundingClientRect();
  const cx = Math.round(rect.left + rect.width / 2);
  const cy = Math.round(rect.bottom + 10);
  // 视口边界兜底：避免浮层溢出屏幕两侧
  const estW = 240;
  const x = Math.min(Math.max(cx, 12 + estW / 2), window.innerWidth - 12 - estW / 2);
  popover.value = {
    show: true,
    date: g.date,
    tasks: g.tasks,
    x,
    y: cy,
    z: nextZIndex(),
  };
}

function closePopover() {
  if (popover.value.show) popover.value.show = false;
}

function jump(taskId) {
  closePopover();
  emit("jump-task", taskId);
}

function onDocClick() { closePopover(); }
function onKey(e) {
  if (e.key === "Escape") closePopover();
}

onMounted(() => {
  updateAxisWidth();
  draw();
  if (axisRef.value && "ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      updateAxisWidth();
      draw();
    });
    resizeObserver.observe(axisRef.value);
  }
  window.addEventListener("resize", onWindowResize);
  document.addEventListener("click", onDocClick);
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  window.removeEventListener("resize", onWindowResize);
  document.removeEventListener("click", onDocClick);
  window.removeEventListener("keydown", onKey);
});

// 数据 / 容器变化时重绘
watch(() => [props.planStart, props.planEnd, props.milestones], () => {
  nextTickDraw();
});
function nextTickDraw() {
  requestAnimationFrame(draw);
}
</script>

<style scoped>
.milestone-timeline {
  width: 100%;
  min-width: 0;
  /* 窄屏横向滚动：轴内容保持最小渲染宽度，超出部分滚动查看 */
  overflow-x: auto;
  scrollbar-width: thin;
}

/* 轴容器：overflow-x 由外层承载，自身不裁切节点 */
.milestone-axis {
  position: relative;
  min-width: 560px;
  height: 100px;
}

.milestone-canvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  pointer-events: none;
}

/* ===== 两端蓝点 + 日期（主题蓝） ===== */
.timeline-endpoint {
  position: absolute;
  top: 54px; /* 蓝点圆心与波浪线 cy 对齐（h/2+8=58，圆心 58.5） */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  pointer-events: none;
  user-select: none;
}
.timeline-endpoint-start { left: 0; transform: translateX(-50%); }
.timeline-endpoint-end { right: 0; transform: translateX(50%); }

.endpoint-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  flex-shrink: 0;
}
.endpoint-date {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ===== 里程碑节点：旗子 + 任务名 + 时间 ===== */
.milestone-node {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 5px 8px 5px 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  max-width: 320px;
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}
/* hover：旗子放大 + 节点描边高亮 */
.milestone-node:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-md);
  z-index: 5;
}
.milestone-node:hover .milestone-flag {
  transform: scale(1.18);
}
.milestone-flag {
  color: #e5484d;
  flex-shrink: 0;
  display: inline-flex;
  line-height: 1;
  transition: transform var(--duration-fast) var(--ease-out);
  margin-top: 1px;
}
.milestone-flag svg { display: block; }

.milestone-node-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.milestone-node-names {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.milestone-node-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
}
.milestone-node-more {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  flex-shrink: 0;
}
.milestone-node-date {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
/* 无时间节点：弱化（灰色旗子 + 虚线边框） */
.milestone-node-nodate {
  border-style: dashed;
}
.milestone-node-nodate .milestone-flag {
  color: var(--text-tertiary);
}

/* ===== 多里程碑 popover ===== */
.milestone-popover {
  position: fixed;
  transform: translateX(-50%);
  min-width: 210px;
  max-width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.milestone-popover-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
}
.milestone-popover-title svg { display: block; flex-shrink: 0; color: #e5484d; }
.milestone-popover-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}
.milestone-popover-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.milestone-popover-item:hover {
  background: var(--bg-hover);
}
.milestone-popover-flag {
  color: #e5484d;
  display: inline-flex;
  flex-shrink: 0;
}
.milestone-popover-flag svg { display: block; }
.milestone-popover-name {
  font-size: 12.5px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
