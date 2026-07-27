<template>
  <div :class="['cal-widget', { 'cal-compact': compact }]">
    <!-- 导航 -->
    <div class="cal-nav">
      <button class="cal-nav-btn" @click="month--">‹</button>
      <span class="cal-nav-title">{{ year }}年{{ month + 1 }}月</span>
      <button class="cal-nav-btn" @click="month++">›</button>
      <button class="cal-nav-btn cal-today-btn" @click="goToday" title="回到今天">•</button>
    </div>

    <!-- 日历网格 -->
    <div class="cal-grid">
      <div class="cal-wday" v-for="w in weekdays" :key="w">{{ w }}</div>
      <div
        v-for="(d, i) in grid" :key="i"
        :class="['cal-cell', {
          'other-month': !d,
          'is-today': d && isSameDay(d, today),
          'is-start': d && isStartDay(d),
          'is-end': d && isEndDay(d),
          'in-range': d && isInRange(d),
        }]"
      >{{ d ? d.getDate() : '' }}</div>
    </div>

    <!-- 时间线 -->
    <div class="tl-section">
      <div class="tl-axis">
        <span class="tl-axis-label">{{ year }}/{{ month + 1 }}/1</span>
        <span class="tl-axis-label">{{ year }}/{{ month + 1 }}/{{ daysInMonth }}</span>
      </div>
      <div class="tl-rows">
        <div v-for="p in projectRows" :key="p.id" class="tl-row">
          <span class="tl-label" :title="p.name">{{ p.shortName }}</span>
          <div class="tl-track" ref="trackRef">
            <div
              v-if="p.leftPct < p.rightPct"
              class="tl-bar"
              :style="{ left: p.leftPct + '%', width: (p.rightPct - p.leftPct) + '%', background: p.color }"
              :title="`${p.name}: ${p.planStart || '?'} ~ ${p.planEnd || '?'}`"
            ></div>
            <div
              v-if="todayInView"
              class="tl-today" :style="{ left: todayPct + '%' }"
              title="今天"
            ></div>
          </div>
        </div>
        <div v-if="!projectRows.length" class="tl-empty">当前月份无项目</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  projects: { type: Array, default: () => [] },
  compact: { type: Boolean, default: true },
});

const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
const weekdays = weekdayNames;

const today = new Date();
today.setHours(0, 0, 0, 0);
const month = ref(today.getMonth());
const year = ref(today.getFullYear());

function goToday() {
  month.value = today.getMonth();
  year.value = today.getFullYear();
}

const daysInMonth = computed(() => new Date(year.value, month.value + 1, 0).getDate());

const grid = computed(() => {
  const firstDay = new Date(year.value, month.value, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth.value; d++) {
    cells.push(new Date(year.value, month.value, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
});

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// 项目日期标记
const monthStart = computed(() => new Date(year.value, month.value, 1));
const monthEnd = computed(() => new Date(year.value, month.value + 1, 0));

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

function isStartDay(d) {
  return props.projects.some(p => {
    const s = parseDate(p.planStart);
    return s && isSameDay(s, d);
  });
}
function isEndDay(d) {
  return props.projects.some(p => {
    const e = parseDate(p.planEnd);
    return e && isSameDay(e, d);
  });
}
function isInRange(d) {
  return props.projects.some(p => {
    const s = parseDate(p.planStart);
    const e = parseDate(p.planEnd);
    return s && e && d >= s && d <= e;
  });
}

// 时间线
const palette = [
  "oklch(0.62 0.15 250)",
  "oklch(0.62 0.15 150)",
  "oklch(0.62 0.15 30)",
  "oklch(0.62 0.15 330)",
  "oklch(0.62 0.15 200)",
  "oklch(0.62 0.15 90)",
];

const todayInView = computed(() => {
  return today >= monthStart.value && today <= monthEnd.value;
});

const todayPct = computed(() => {
  const total = monthEnd.value - monthStart.value;
  if (total <= 0) return 0;
  return ((today - monthStart.value) / total) * 100;
});

const projectRows = computed(() => {
  return props.projects.map((p, idx) => {
    const start = parseDate(p.planStart);
    const end = parseDate(p.planEnd);
    const color = palette[idx % palette.length];
    const name = p.name || "未命名";
    // 计算可见区间的 bar 位置
    const visStart = start && start > monthStart.value ? start : monthStart.value;
    const visEnd = end && end < monthEnd.value ? end : monthEnd.value;
    const total = monthEnd.value - monthStart.value;
    const leftPct = total > 0 ? ((visStart - monthStart.value) / total) * 100 : 0;
    const rightPct = total > 0 ? ((visEnd - monthStart.value) / total) * 100 : 0;
    return { id: p.id, name, shortName: name.length > 6 ? name.slice(0, 6) + "…" : name, planStart: p.planStart, planEnd: p.planEnd, color, leftPct, rightPct };
  }).filter(p => p.leftPct < p.rightPct || (parseDate(p.planStart) && parseDate(p.planEnd) && parseDate(p.planStart) >= monthStart.value));
  // 保留至少有一端在当前月份内的项目
});
</script>

<style scoped>
/* 基础布局 - 非 compact 模式下用 flex 撑满 */
.cal-widget {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: 14px;
}
.cal-compact { font-size: 12px; display: flex; flex-direction: column; }
.cal-widget:not(.cal-compact) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.cal-widget:not(.cal-compact) .cal-grid {
  flex: 1;
  align-content: start;
}
.cal-widget:not(.cal-compact) .tl-section {
  flex-shrink: 0;
}

/* 导航 */
.cal-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
}
.cal-compact .cal-nav { padding: 8px 10px; gap: 4px; }

.cal-nav-btn {
  width: 30px; height: 30px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 120ms var(--ease-out);
}
.cal-compact .cal-nav-btn { width: 22px; height: 22px; font-size: 14px; border-radius: 4px; }

.cal-nav-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
  color: var(--text);
}
.cal-today-btn {
  margin-left: auto;
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
}
.cal-compact .cal-today-btn { font-size: 16px; }
.cal-today-btn:hover { background: var(--accent-subtle); }
.cal-nav-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  min-width: 80px;
  text-align: center;
}
.cal-compact .cal-nav-title { font-size: 13px; }

/* 网格 */
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  padding: 10px 14px;
  background: var(--bg-card);
}
.cal-compact .cal-grid { gap: 1px; padding: 6px 8px; }

.cal-wday {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 6px 0;
}
.cal-compact .cal-wday { font-size: 10px; padding: 2px 0; }

.cal-cell {
  text-align: center;
  padding: 8px 0;
  font-size: 15px;
  color: var(--text);
  border-radius: 6px;
  position: relative;
  cursor: default;
}
.cal-compact .cal-cell { padding: 2px 0; font-size: 11px; border-radius: 4px; }

.cal-cell.other-month { color: var(--text-tertiary); }
.cal-cell.is-today {
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  border-radius: 50%;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cal-compact .cal-cell.is-today { width: 22px; height: 22px; display: flex; margin: 0 auto; }

.cal-cell.is-start {
  background: oklch(from var(--accent) l c h / 0.15);
  border-radius: 6px 0 0 6px;
}
.cal-cell.is-end {
  background: oklch(from var(--accent) l c h / 0.15);
  border-radius: 0 6px 6px 0;
}
.cal-cell.in-range {
  background: oklch(from var(--accent) l c h / 0.08);
}

/* 时间线 */
.tl-section {
  border-top: 1px solid var(--border-light);
  padding: 12px 14px;
}
.cal-compact .tl-section { padding: 8px 10px; }

.tl-axis {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.cal-compact .tl-axis { margin-bottom: 4px; }

.tl-axis-label {
  font-size: 11px;
  color: var(--text-tertiary);
}
.cal-compact .tl-axis-label { font-size: 9px; }

.tl-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cal-compact .tl-rows { gap: 5px; }

.tl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 28px;
}
.cal-compact .tl-row { gap: 6px; height: 20px; }

.tl-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  flex-shrink: 0;
}
.cal-compact .tl-label { font-size: 10px; min-width: 48px; }

.tl-track {
  flex: 1;
  height: 14px;
  background: var(--bg-hover);
  border-radius: 7px;
  position: relative;
  overflow: hidden;
}
.cal-compact .tl-track { height: 10px; border-radius: 5px; }

.tl-bar {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 7px;
  opacity: 0.8;
  transition: opacity 150ms var(--ease-out);
}
.cal-compact .tl-bar { border-radius: 5px; opacity: 0.75; }
.tl-bar:hover { opacity: 1; }

.tl-today {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 18px;
  background: oklch(0.5 0.18 30);
  border-radius: 1px;
  transform: translateX(-50%);
  z-index: 1;
}
.cal-compact .tl-today { top: -1px; height: 12px; }

.tl-empty {
  text-align: center;
  padding: 20px 0;
  color: var(--text-tertiary);
  font-size: 13px;
}
.cal-compact .tl-empty { padding: 12px 0; font-size: 11px; }
</style>
