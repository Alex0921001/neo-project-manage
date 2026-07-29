<template>
  <div class="detail-meta">
    <!-- 头部：返回 + 标题 + 编辑 -->
    <div class="meta-head">
      <button class="btn-back" @click="$emit('back')" title="返回项目列表">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="meta-title" v-if="project?.name">{{ fullTitle }}</span>
      <span v-else class="meta-title meta-title-empty">未命名项目</span>
      <button class="icon-btn" v-if="project" @click="$emit('edit')" title="编辑项目">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>

    <!-- 状态徽标 + 距离天数（高亮卡片）-->
    <div class="meta-headline">
      <div class="status-dropdown" ref="statusDropdownRef" @click.stop>
        <button :class="['meta-status-chip', 'chip-button', statusClass(displayStatus)]" @click="statusOpen = !statusOpen" :disabled="!project">
          <span class="status-dot"></span>
          <span>{{ displayStatus || '待开始' }}</span>
          <svg class="chip-caret" :class="{ open: statusOpen }" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="statusOpen" class="status-menu">
          <button
            v-for="opt in statusOptions" :key="opt.value"
            :class="['status-menu-item', statusClass(opt.value), { active: opt.value === displayStatus }]"
            @click="pickStatus(opt.value)"
          >
            <span class="status-dot"></span>
            <span class="status-menu-label">{{ opt.label }}</span>
            <svg v-if="opt.value === displayStatus" class="status-menu-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>
      <div v-if="countdownText" :class="['meta-countdown', countdownClass]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>{{ countdownText }}</span>
      </div>
    </div>

    <!-- 字段卡片网格 -->
    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-card-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          计划周期
        </div>
        <div class="meta-card-value meta-card-date">
          <div>{{ project?.planStart || '—' }}</div>
          <div class="meta-card-date-sep">至</div>
          <div>{{ project?.planEnd || '—' }}</div>
        </div>
      </div>

      <div class="meta-card">
        <div class="meta-card-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          成员
        </div>
        <div class="meta-card-value">
          <div v-if="(project?.members || []).length" class="member-pills">
            <span
              v-for="m in project.members"
              :key="m"
              class="member-pill"
              :title="m"
            >
              <span class="member-pill-avatar" :style="{ background: avatarColor(m) }">{{ m.slice(0, 1) }}</span>
              <span class="member-pill-name">{{ m }}</span>
            </span>
          </div>
          <span v-else class="meta-empty">未指定</span>
        </div>
      </div>

      <div class="meta-card meta-card-wide">
        <div class="meta-card-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          描述
        </div>
        <div class="meta-card-value meta-desc">
          <div v-if="project?.description" class="meta-desc-body" v-html="formatDescription(project.description)"></div>
          <span v-else class="meta-empty">暂无描述</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { computeDisplayStatus } from "../../../utils/status.js";
import { formatDescription } from "../../../utils/text.js";

const props = defineProps({
  project: Object,
  setLabel: { type: String, default: "" },
});
const emit = defineEmits(["edit", "back", "change-status"]);

const statusOpen = ref(false);
const statusDropdownRef = ref(null);
const statusOptions = [
  { value: "待开始", label: "待开始" },
  { value: "进行中", label: "进行中" },
  { value: "已完成", label: "已完成" },
];

function pickStatus(v) {
  statusOpen.value = false;
  if (!props.project || v === props.project.status) return;
  emit("change-status", v);
}

function onDocClick(e) {
  if (statusOpen.value && statusDropdownRef.value && !statusDropdownRef.value.contains(e.target)) {
    statusOpen.value = false;
  }
}
onMounted(() => document.addEventListener("mousedown", onDocClick));
onUnmounted(() => document.removeEventListener("mousedown", onDocClick));

const fullTitle = computed(() => {
  if (!props.project) return "";
  const name = props.project.name || "";
  if (props.setLabel) return `${props.setLabel} - ${name}`;
  return name;
});

function statusClass(s) {
  return {
    "待开始": "status-todo",
    "进行中": "status-doing",
    "已完成": "status-done",
    "已延期": "status-delay",
  }[s] || "status-todo";
}

const displayStatus = computed(() => computeDisplayStatus(props.project));

// 距离天数
const today = new Date();
today.setHours(0, 0, 0, 0);

function daysBetween(d1, d2) {
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

const countdown = computed(() => {
  if (!props.project) return null;
  const start = props.project.planStart ? new Date(props.project.planStart) : null;
  const end = props.project.planEnd ? new Date(props.project.planEnd) : null;
  if (!start && !end) return null;

  const status = props.project.status;
  if (status === "已完成") {
    return { kind: "done", days: 0, text: "已完成" };
  }
  if (end) {
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    const diff = daysBetween(today, endDay);
    if (diff > 0) return { kind: "future", days: diff, text: `距离结束还有 ${diff} 天` };
    if (diff === 0) return { kind: "today", days: 0, text: `今天结束` };
    if (diff < 0) return { kind: "overdue", days: -diff, text: `已延期 ${-diff} 天` };
  }
  if (start) {
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    const diff = daysBetween(today, startDay);
    if (diff > 0) return { kind: "future", days: diff, text: `距离开始还有 ${diff} 天` };
    if (diff === 0) return { kind: "today", days: 0, text: `今天开始` };
    if (diff < 0) return { kind: "started", days: -diff, text: `已开始 ${-diff} 天` };
  }
  return null;
});

const countdownText = computed(() => countdown.value?.text || "");
const countdownClass = computed(() => `countdown-${countdown.value?.kind || "neutral"}`);

// 成员头像颜色
const avatarPalette = [
  "oklch(0.62 0.10 240)",
  "oklch(0.62 0.10 180)",
  "oklch(0.62 0.10 280)",
  "oklch(0.62 0.10 320)",
  "oklch(0.62 0.08 60)",
  "oklch(0.58 0.10 200)",
  "oklch(0.58 0.08 145)",
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return avatarPalette[h % avatarPalette.length];
}
</script>

<style scoped>
.detail-meta {
  background: #ffffff;
  border-radius: var(--radius-lg);
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 18px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 360px;
  gap: 14px;
}

/* header */
.meta-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}
.meta-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #1f2937;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-title-empty { color: #9ca3af; font-weight: 500; }

.icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.btn-back {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.icon-btn:hover,
.btn-back:hover {
  background: #f3f4f6;
  color: #111827;
  border-color: #9ca3af;
}
.icon-btn svg,
.btn-back svg { display: block; }

/* 状态徽标 + 距离天数（高亮行）*/
.meta-headline {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}
.meta-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}
.chip-button {
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.02em;
  padding-right: 8px;
  transition: filter 120ms ease-out, transform 120ms ease-out;
}
.chip-button:hover:not(:disabled) {
  filter: brightness(0.96);
}
.chip-button:active:not(:disabled) {
  transform: translateY(1px);
}
.chip-button:disabled {
  cursor: default;
  opacity: 0.6;
}
.chip-caret {
  display: inline-block;
  margin-left: 2px;
  opacity: 0.7;
  transition: transform 160ms ease-out;
}
.chip-caret.open {
  transform: rotate(180deg);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 3px currentColor;
}
.status-todo { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.status-doing { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
.status-done { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
.status-delay { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

/* 状态下拉 */
.status-dropdown { position: relative; display: inline-flex; }
.status-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.10), 0 2px 6px rgba(0, 0, 0, 0.05);
  padding: 4px;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  animation: statusMenuIn 0.14s ease-out;
}
@keyframes statusMenuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.status-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 7px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  transition: background 120ms ease-out;
}
.status-menu-item:hover {
  background: #f3f4f6;
}
.status-menu-item.active {
  background: #f9fafb;
}
.status-menu-label {
  flex: 1;
}
.status-menu-check {
  color: #10b981;
  flex-shrink: 0;
}

/* 距离天数 */
.meta-countdown {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  flex: 1;
  justify-content: center;
  min-width: 0;
}
.meta-countdown svg { display: block; flex-shrink: 0; }
.countdown-future { background: #ffffff; color: #374151; border-color: #d1d5db; }
.countdown-today { background: #f9fafb; color: #111827; border-color: #6b7280; font-weight: 700; }
.countdown-overdue { background: #f3f4f6; color: #111827; border-color: #1f2937; font-weight: 700; }
.countdown-started { background: #f9fafb; color: #4b5563; border-color: #e5e7eb; }
.countdown-done { background: #f9fafb; color: #4b5563; border-color: #e5e7eb; }

/* 字段卡片网格 */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.meta-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all var(--duration-fast) var(--ease-out);
}
.meta-card:hover {
  border-color: #9ca3af;
  background: #ffffff;
}
.meta-card-wide { grid-column: 1 / -1; }
.meta-card-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.meta-card-label svg { display: block; opacity: 0.7; }
.meta-card-value {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.45;
}
.meta-card-date {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.meta-card-date-sep { color: #9ca3af; font-size: 12px; }
.meta-desc {
  font-weight: 400;
  color: #4b5563;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 96px;
  overflow-y: auto;
}
.meta-desc-body {
  font-weight: 400;
  color: #4b5563;
  word-break: break-word;
  line-height: 1.6;
}
.meta-desc-body :deep(p) { margin: 0 0 4px; }
.meta-desc-body :deep(p:last-child) { margin-bottom: 0; }
.meta-desc-body :deep(ul),
.meta-desc-body :deep(ol) { margin: 4px 0; padding-left: 18px; }
.meta-desc::-webkit-scrollbar { width: 4px; }
.meta-desc::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
.meta-empty { color: #9ca3af; font-weight: 400; font-style: italic; }

/* 成员 pill：头像 + 姓名，姓名能完整显示 */
.member-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.member-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px 0 2px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  max-width: 100%;
  font-size: 11px;
  color: #374151;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 0;
}
.member-pill-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0;
}
.member-pill-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
}
</style>
