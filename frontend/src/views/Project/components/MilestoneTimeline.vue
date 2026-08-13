<template>
  <div v-if="milestones.length" class="milestone-timeline">
      <!-- 轴容器：宽度自适应外层，高度随错层层数动态（一屏展示，不横向滚动） -->
      <div class="milestone-axis" ref="axisRef" :style="{ height: axisHeight + 'px' }">
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
        v-for="(it, gi) in layoutNodes"
        :key="gi"
        class="milestone-node"
        :class="{ 'milestone-node-multi': it.g.tasks.length > 1, 'milestone-node-edge': it.edge }"
        :style="{ left: it.left + 'px', top: (22 + it.row * NODE_ROW_STEP) + 'px' }"
        :title="`里程碑 · ${it.g.date}`"
        @click.stop="onNodeClick(it.g, $event)"
      >
        <!-- 任务名：旗子正上方（平衡上下视觉；贴端点节点不显示日期，由端点蓝点日期承担） -->
        <div class="milestone-node-names">
          <template v-if="it.g.tasks.length === 1">
            <span class="milestone-node-name">{{ shortName(it.g.tasks[0].name) }}</span>
          </template>
          <template v-else>
            <span class="milestone-node-name">{{ shortName(it.g.tasks[0].name) }}</span>
            <span class="milestone-node-more">（+{{ it.g.tasks.length - 1 }}）</span>
          </template>
        </div>
        <!-- 旗子立在波浪线上（有里程碑任务 = 红；纯批注节点 = 琥珀） -->
        <span class="milestone-flag" :class="{ 'flag-amber': !it.g.hasTask }">
          <svg width="15" height="15" viewBox="0 0 24 22" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </span>
        <div class="milestone-node-info">
          <!-- 时间（贴端点节点不显示，由端点蓝点日期承担，避免重叠） -->
          <div v-if="!it.edge" class="milestone-node-date">{{ shortDate(it.g.date) }}</div>
          <!-- 里程碑批注标签：固定「便利贴 × N」格式（清爽），点击弹便利贴 popover -->
          <div v-if="it.g.anns.length" class="milestone-node-anns">
            <span
              class="milestone-ann-tag"
              title="查看里程碑批注"
              @click.stop="openAnnPopover(it.g, $event)"
            >便利贴 × {{ it.g.anns.length }}</span>
          </div>
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

    <!-- 里程碑批注 popover：便利贴样式展示完整批注 + 挂载任务名（3.1） -->
    <teleport to="body">
      <div
        v-if="annPopover.show"
        class="milestone-ann-popover"
        :style="{ left: annPopover.x + 'px', top: annPopover.y + 'px', zIndex: annPopover.z }"
        @click.stop
      >
        <div class="milestone-ann-pop-head">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>里程碑批注{{ annPopover.anns.length > 1 ? `（${annPopover.anns.length} 条）` : '' }}</span>
        </div>
        <div class="milestone-ann-pop-list">
          <div v-for="a in annPopover.anns" :key="a.id" class="milestone-ann-pop-card" title="点击定位到批注" @click="jumpAnn(a)">
            <div class="milestone-ann-pop-task">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
              <span class="milestone-ann-pop-taskname">{{ a.taskName }}</span>
            </div>
            <div class="milestone-ann-pop-content rich-view" v-html="formatDescription(a.content)"></div>
            <div class="milestone-ann-pop-time">{{ formatTime(a.createdAt) }}</div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { nextZIndex } from "../../../utils/zIndex.js";
import { formatDescription } from "../../../utils/text.js";

const props = defineProps({
  planStart: { type: String, default: "" },
  planEnd: { type: String, default: "" },
  // 完整任务树（任意层级），组件内部收集里程碑节点与 milestone 批注（控件自包含）
  tasks: { type: Array, default: () => [] },
});
const emit = defineEmits(["jump-task", "jump-annotation"]);

// ===== 收集里程碑节点：isMilestone 任务，或挂有 milestone（节点）类型批注的任务 =====
function collectMilestones(list, acc = []) {
  for (const t of list || []) {
    if (t.isMilestone || t.annotations?.some((a) => a.kind === "milestone")) acc.push(t);
    collectMilestones(t.subtasks, acc);
  }
  return acc;
}
const milestones = computed(() => collectMilestones(props.tasks));

// ===== 数据分组：按开始日期聚合，同日归一组；无时间节点排最后 =====
// 组内附带 anns：收集挂在该组里程碑任务上的 milestone 类型批注（3.1）
function collectMilestoneAnns(tasks) {
  const anns = [];
  for (const t of tasks || []) {
    for (const a of t.annotations || []) {
      if (a.kind === "milestone") {
        anns.push({ ...a, taskId: t.id, taskName: t.name, taskStartDate: t.startDate });
      }
    }
  }
  return anns;
}

const groups = computed(() => {
  const byDate = new Map();
  // 无开始时间的里程碑任务不显示在步骤条上（用户要求）
  for (const m of milestones.value || []) {
    if (!m.startDate) continue;
    if (!byDate.has(m.startDate)) byDate.set(m.startDate, []);
    byDate.get(m.startDate).push(m);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) // 日期升序
    .map(([date, tasks]) => ({
      date,
      tasks,
      anns: collectMilestoneAnns(tasks),
      hasTask: tasks.some((t) => t.isMilestone), // 存在真里程碑任务 → 红旗；纯批注节点 → 琥珀旗
    }));
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

// 轴左右留白（px）：给两端蓝点与极端位置节点留出呼吸空间（端点内移，边缘节点不顶格）
const PAD_X = 72;

// 节点横向位置：有时间的按比例定位，无时间的放轴右端
// ===== 布局：去重排序后，首尾与项目起止时间重叠的贴端点，其余在中间均分；密集时碰撞错层 =====
const NODE_MIN_GAP = 140; // 节点最小水平间距（px，按文字块宽度估算）
const NODE_ROW_STEP = 26; // 每层垂直偏移（px）
const NODE_EDGE_GAP = 64; // 端点对齐节点与相邻中间节点的间距（px）
const layoutNodes = computed(() => {
  const items = groups.value; // 去重、按日期升序
  const n = items.length;
  if (!n) return [];
  const w = axisWidth.value;
  const lineStart = PAD_X;
  const lineEnd = Math.max(w - PAD_X, lineStart + 1);

  // 首尾与项目起止时间重叠检测（日期相等即重叠）
  const s = endpoints.value.s;
  const e = endpoints.value.e;
  // 单节点特例：与项目开始重叠贴左端；与结束重叠（且不与开始重叠）贴右端；否则居中
  if (n === 1) {
    const g0 = items[0];
    if (!!s && g0.date === s) return [{ g: g0, left: lineStart, edge: true, row: 0 }];
    if (!!e && g0.date === e) return [{ g: g0, left: lineEnd, edge: true, row: 0 }];
    return [{ g: g0, left: Math.round((lineStart + lineEnd) / 2), edge: false, row: 0 }];
  }
  const firstAlign = !!s && items[0].date === s; // 第一个 == 项目开始 → 贴左端
  const lastAlign = !!e && items[n - 1].date === e; // 最后一个 == 项目结束 → 贴右端

  // 中间均分区间（端点被占则让出空间）
  const innerStart = firstAlign ? lineStart + NODE_EDGE_GAP : lineStart;
  const innerEnd = lastAlign ? lineEnd - NODE_EDGE_GAP : lineEnd;

  const placed = [];
  if (firstAlign) placed.push({ g: items[0], left: lineStart, edge: true });
  const midCount = n - (firstAlign ? 1 : 0) - (lastAlign ? 1 : 0);
  if (midCount > 0) {
    const usable = Math.max(innerEnd - innerStart, 0);
    const midItems = items.slice(firstAlign ? 1 : 0, n - (lastAlign ? 1 : 0));
    midItems.forEach((g, i) => {
      const pos = midCount > 1 ? (i + 1) / (midCount + 1) : 0.5; // 中间均分，两端留白
      placed.push({ g, left: innerStart + pos * usable, edge: false });
    });
  }
  if (lastAlign) placed.push({ g: items[n - 1], left: lineEnd, edge: true });

  // 碰撞错层：相邻节点间距不足时垂直换行，文字不重叠
  const rowRight = []; // 每行最后一个节点的 left
  return placed.map((it) => {
    let row = 0;
    while (row < rowRight.length && it.left - rowRight[row] < NODE_MIN_GAP) row++;
    if (row === rowRight.length) rowRight.push(it.left);
    else rowRight[row] = it.left;
    return { ...it, row };
  });
});

// 轴高动态：基础 118 + 错层层数 × 行距（给下方信息留足空间）
const axisHeight = computed(() => {
  const maxRow = layoutNodes.value.reduce((m, n) => Math.max(m, n.row), 0);
  return 118 + maxRow * NODE_ROW_STEP;
});

// ===== 里程碑批注标签（3.1） =====
// 任务名：节点下方限 10 字，超长截断（popover 内仍显示完整名）
function shortName(name) {
  const s = String(name || "");
  return s.length > 10 ? `${s.slice(0, 10)}...` : s;
}
// popover 内完整时间（MM-DD HH:mm）
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  // 实时读宽度并同步 ref（节点定位与画线始终一致）
  const w = axis.clientWidth;
  axisWidth.value = w;
  const h = axis.clientHeight;
  const dpr = window.devicePixelRatio || 1;
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
  const cy = 58; // 波浪线垂直位置（固定）：与端点蓝点（top 54 + 半径 4.5）及旗子底部对齐

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

  // 节点位置灰点：每个里程碑节点在波浪线上的落点标记（与 DOM 节点 left 对齐）
  ctx.fillStyle = "rgba(120, 130, 145, 0.5)";
  for (const it of layoutNodes.value) {
    ctx.beginPath();
    ctx.arc(it.left, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== popover（自定义浮层）=====
const popover = ref({ show: false, date: "", tasks: [], x: 0, y: 0, z: 0 });
// 里程碑批注 popover（3.1）
const annPopover = ref({ show: false, anns: [], x: 0, y: 0, z: 0 });

// popover 视口适配：测量真实尺寸后 clamp 到视口内，四周留呼吸边距
const POPOVER_BREATH = 50;
function fitToViewport(x, y, w, h) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 水平：x 为浮层中心点
  const cx = Math.min(Math.max(x, POPOVER_BREATH + w / 2), vw - POPOVER_BREATH - w / 2);
  // 垂直：y 为浮层顶部；高度超可用空间时顶部优先（内部滚动承载溢出）
  let cy;
  if (h >= vh - 2 * POPOVER_BREATH) cy = POPOVER_BREATH;
  else cy = Math.min(Math.max(y, POPOVER_BREATH), vh - POPOVER_BREATH - h);
  return { x: Math.round(cx), y: Math.round(cy) };
}
// v-if 渲染后测量实际尺寸再约束（避免用估算宽度定位不准）
function constrainToViewport(refObj, selector) {
  nextTick(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    const { x, y } = fitToViewport(refObj.x, refObj.y, el.offsetWidth, el.offsetHeight);
    refObj.x = x;
    refObj.y = y;
  });
}

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
  closeAnnPopover();
  popover.value = {
    show: true,
    date: g.date,
    tasks: g.tasks,
    x: cx,
    y: cy,
    z: nextZIndex(),
  };
  constrainToViewport(popover.value, ".milestone-popover");
}

// 里程碑批注 popover：点击标签打开，便利贴展示完整内容 + 挂载任务名
function openAnnPopover(g, ev) {
  const rect = ev.currentTarget.getBoundingClientRect();
  const cx = Math.round(rect.left + rect.width / 2);
  const cy = Math.round(rect.bottom + 8);
  closePopover();
  annPopover.value = {
    show: true,
    anns: g.anns,
    x: cx,
    y: cy,
    z: nextZIndex(),
  };
  constrainToViewport(annPopover.value, ".milestone-ann-popover");
}

function closePopover() {
  if (popover.value.show) popover.value.show = false;
}
function closeAnnPopover() {
  if (annPopover.value.show) annPopover.value.show = false;
}
// 统一关闭（外部点击 / Escape）
function closeAllPopovers() {
  closePopover();
  closeAnnPopover();
}

function jump(taskId) {
  closeAllPopovers();
  emit("jump-task", taskId);
}

// 点击里程碑批注卡片：定位到挂载任务并高亮该批注
function jumpAnn(a) {
  closeAllPopovers();
  emit("jump-annotation", { taskId: a.taskId, annotationId: a.id });
}

function onDocClick() { closeAllPopovers(); }
function onKey(e) {
  if (e.key === "Escape") closeAllPopovers();
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
watch(() => [props.planStart, props.planEnd, props.tasks], () => {
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
}

/* 轴容器：宽度自适应外层（一屏展示，随容器缩放拉长），不横向滚动 */
.milestone-axis {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 118px; /* 顶部旗子 + 下方时间/名称/批注留足空间 */
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
.timeline-endpoint-start { left: 72px; transform: translateX(-50%); }
.timeline-endpoint-end { right: 72px; transform: translateX(50%); }

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

/* ===== 里程碑节点：任务名（上） + 旗子（中，插在波浪线上） + 时间/便利贴（下） =====
 * 任务名上移平衡视觉：上方 任务名，旗杆插波浪线，下方 时间 + 便利贴 */
.milestone-node {
  position: absolute;
  top: 22px; /* 旗子底部对齐波浪线（cy=58）；任务名 12px×1.5 + gap 3 上移到旗子上方 */
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  max-width: 220px;
  z-index: 2;
  transition: transform var(--duration-fast) var(--ease-out);
}
/* hover：旗子放大 */
.milestone-node:hover {
  z-index: 5;
}
.milestone-node:hover .milestone-flag {
  transform: translate(4px, -4px) scale(1.18);
}
.milestone-flag {
  color: #e5484d;
  flex-shrink: 0;
  display: inline-flex;
  line-height: 1;
  transition: transform var(--duration-fast) var(--ease-out);
  /* 旗杆在 svg 内 x=4 偏左、底部视觉偏下：右移 4px + 上移 4px，让杆底插到灰点中心 */
  transform: translate(4px, -4px);
}
.milestone-flag svg { display: block; }
/* 纯批注节点：橙色旗（与批注标签同色系），与红色里程碑旗区分 */
.milestone-flag.flag-amber {
  color: oklch(0.72 0.16 55);
}

.milestone-node-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
/* 贴端点节点：自身不显示日期，便利贴标签下移避开端点蓝点日期（端点日期约在 68~82px 区域） */
.milestone-node-edge .milestone-node-info {
  padding-top: 24px;
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
  white-space: nowrap;
  max-width: 100%;
  min-width: 0;
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

/* ===== 里程碑批注标签（3.1）：便利贴式小标签，色相对齐 milestone 类型 ===== */
.milestone-node-anns {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  flex-wrap: wrap;
}
.milestone-ann-tag {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  padding: 1px 7px;
  border-radius: 3px;
  font-size: 10.5px;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: oklch(0.95 0.09 75);
  color: oklch(0.5 0.14 75);
  cursor: pointer;
  user-select: none;
  transition: filter var(--duration-fast) var(--ease-out);
}
.milestone-ann-tag:hover {
  filter: brightness(0.94);
}
.milestone-ann-tag-more {
  background: var(--bg-hover);
  color: var(--text-secondary);
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

/* ===== 里程碑批注 popover（3.1）：便利贴列表，风格对齐里程碑 popover 骨架 ===== */
.milestone-ann-popover {
  position: fixed;
  transform: translateX(-50%);
  min-width: 240px;
  max-width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.milestone-ann-pop-head {
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
.milestone-ann-pop-head svg {
  display: block;
  flex-shrink: 0;
  color: oklch(0.6 0.14 75);
}
.milestone-ann-pop-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 便利贴卡片：sticky 底色 + 轻阴影 */
.milestone-ann-pop-card {
  padding: 8px 10px 6px;
  background: oklch(0.95 0.09 75);
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: filter var(--duration-fast) var(--ease-out);
}
.milestone-ann-pop-card:hover {
  filter: brightness(0.94);
}
.milestone-ann-pop-task {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: oklch(0.5 0.14 75);
}
.milestone-ann-pop-task svg {
  display: block;
  flex-shrink: 0;
}
.milestone-ann-pop-taskname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.milestone-ann-pop-content {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
  word-break: break-word;
  margin-bottom: 2px;
}
.milestone-ann-pop-time {
  font-size: 10.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
