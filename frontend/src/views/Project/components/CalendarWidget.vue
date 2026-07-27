<template>
  <div :class="['cal-widget', { 'cal-compact': compact }]">
    <FullCalendar :options="fcOptions" />
    <!-- 时间线仅 compact 模式保留 -->
    <div v-if="compact" class="tl-section">
      <div class="tl-axis">
        <span class="tl-axis-label">{{ tlYear }}/{{ tlMonth + 1 }}/1</span>
        <span class="tl-axis-label">{{ tlYear }}/{{ tlMonth + 1 }}/{{ tlDaysInMonth }}</span>
      </div>
      <div class="tl-rows">
        <div v-for="p in tlRows" :key="p.id" class="tl-row">
          <span class="tl-label" :title="p.name">{{ p.shortName }}</span>
          <div class="tl-track">
            <div
              v-if="p.leftPct < p.rightPct"
              class="tl-bar"
              :style="{ left: p.leftPct + '%', width: (p.rightPct - p.leftPct) + '%', background: p.color }"
              :title="`${p.name}: ${p.planStart || '?'} ~ ${p.planEnd || '?'}`"
            ></div>
            <div
              v-if="tlTodayInView"
              class="tl-today" :style="{ left: tlTodayPct + '%' }"
              title="今天"
            ></div>
          </div>
        </div>
        <div v-if="!tlRows.length" class="tl-empty">当前月份无项目</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import FullCalendar from "@fullcalendar/vue3";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import zhCn from "@fullcalendar/core/locales/zh-cn";

const props = defineProps({
  projects: { type: Array, default: () => [] },
  compact: { type: Boolean, default: true },
});

// ===== 调色板 =====
const palette = [
  "oklch(0.62 0.15 250)",
  "oklch(0.62 0.15 150)",
  "oklch(0.62 0.15 30)",
  "oklch(0.62 0.15 330)",
  "oklch(0.62 0.15 200)",
  "oklch(0.62 0.15 90)",
];

// ===== 事件映射 (FC 左闭右开，end 须 +1 天) =====
const fcEvents = computed(() =>
  props.projects
    .map((p, idx) => {
      if (!p.planStart || !p.planEnd) return null;
      const endDate = new Date(p.planEnd);
      endDate.setDate(endDate.getDate() + 1);
      return {
        title: p.name || "未命名",
        start: p.planStart,
        end: endDate.toISOString().slice(0, 10),
        backgroundColor: palette[idx % palette.length],
        borderColor: palette[idx % palette.length],
        textColor: "#fff",
        extendedProps: { projectId: p.id },
      };
    })
    .filter(Boolean)
);

// ===== FullCalendar 选项 =====
const fcOptions = computed(() => ({
  plugins: [dayGridPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  locale: zhCn,
  height: props.compact ? "auto" : undefined,
  contentHeight: props.compact ? "auto" : undefined,
  dayMaxEvents: props.compact ? 2 : 3,
  headerToolbar: props.compact
    ? false
    : { left: "prev,next", center: "title", right: "" },
  editable: false,
  selectable: false,
  dayCellClassNames,
  datesSet: onDatesSet,
  events: fcEvents.value,
  eventClick(info) {
    console.log("点击项目：", info.event.title);
  },
}));

// ===== 今日高亮 =====
const today = new Date();
today.setHours(0, 0, 0, 0);

function dayCellClassNames(arg) {
  const d = arg.date;
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return ["fc-day-today-custom"];
  }
  return [];
}

// ===== 时间线月份 =====
const tlYear = ref(today.getFullYear());
const tlMonth = ref(today.getMonth());
const tlDaysInMonth = computed(() => new Date(tlYear.value, tlMonth.value + 1, 0).getDate());

function onDatesSet(info) {
  // info.start 是视图起始日期（Date 对象）
  tlYear.value = info.start.getFullYear();
  tlMonth.value = info.start.getMonth();
}

// ===== 时间线计算 =====
const tlMonthStart = computed(() => new Date(tlYear.value, tlMonth.value, 1));
const tlMonthEnd = computed(() => new Date(tlYear.value, tlMonth.value + 1, 0));

const tlTodayInView = computed(() => today >= tlMonthStart.value && today <= tlMonthEnd.value);

const tlTodayPct = computed(() => {
  const total = tlMonthEnd.value - tlMonthStart.value;
  if (total <= 0) return 0;
  return ((today - tlMonthStart.value) / total) * 100;
});

const tlRows = computed(() =>
  props.projects.map((p, idx) => {
    const s = parseDate(p.planStart);
    const e = parseDate(p.planEnd);
    const name = p.name || "未命名";
    const color = palette[idx % palette.length];
    // 可见区间
    const visStart = s && s > tlMonthStart.value ? s : tlMonthStart.value;
    const visEnd = e && e < tlMonthEnd.value ? e : tlMonthEnd.value;
    const total = tlMonthEnd.value - tlMonthStart.value;
    const leftPct = total > 0 ? ((visStart - tlMonthStart.value) / total) * 100 : 0;
    const rightPct = total > 0 ? ((visEnd - tlMonthStart.value) / total) * 100 : 0;
    return {
      id: p.id,
      name,
      shortName: name.length > 6 ? name.slice(0, 6) + "…" : name,
      planStart: p.planStart,
      planEnd: p.planEnd,
      color,
      leftPct,
      rightPct,
    };
  }).filter(Boolean)
);

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}
</script>

<style scoped>
.cal-widget {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: 14px;
}
.cal-compact { font-size: 12px; }
.cal-widget:not(.cal-compact) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.cal-widget:not(.cal-compact) :deep(.fc) {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.cal-widget:not(.cal-compact) :deep(.fc .fc-view-harness) {
  flex: 1;
}

/* 时间线（仅 compact） */
.tl-section {
  border-top: 1px solid var(--border-light);
  padding: 8px 10px;
}
.tl-axis {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.tl-axis-label {
  font-size: 9px;
  color: var(--text-tertiary);
}
.tl-rows {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tl-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 20px;
}
.tl-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  flex-shrink: 0;
}
.tl-track {
  flex: 1;
  height: 10px;
  background: var(--bg-hover);
  border-radius: 5px;
  position: relative;
  overflow: hidden;
}
.tl-bar {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 5px;
  opacity: 0.75;
  transition: opacity 150ms var(--ease-out);
}
.tl-bar:hover { opacity: 1; }
.tl-today {
  position: absolute;
  top: -1px;
  width: 2px;
  height: 12px;
  background: oklch(0.5 0.18 30);
  border-radius: 1px;
  transform: translateX(-50%);
  z-index: 1;
}
.tl-empty {
  text-align: center;
  padding: 12px 0;
  color: var(--text-tertiary);
  font-size: 11px;
}
</style>

<style>
/* ===== FullCalendar 全局样式覆盖 ===== */
/* 全页模式 */
.cal-widget:not(.cal-compact) .fc {
  --fc-border-color: #e5e7eb;
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
  font-size: 14px;
}
.cal-widget:not(.cal-compact) .fc .fc-toolbar-title {
  font-size: 1.25em;
  font-weight: 600;
}
.cal-widget:not(.cal-compact) .fc .fc-button {
  font-size: 13px;
  padding: 4px 10px;
  background: var(--bg-card);
  border-color: var(--border);
  color: var(--text);
}
.cal-widget:not(.cal-compact) .fc .fc-button:hover {
  background: var(--bg-hover);
}
.cal-widget:not(.cal-compact) .fc .fc-button:focus {
  box-shadow: none;
}
.cal-widget:not(.cal-compact) .fc .fc-daygrid-day-frame {
  padding: 2px;
}
.cal-widget:not(.cal-compact) .fc .fc-daygrid-day-number {
  font-size: 13px;
  color: var(--text);
  padding: 4px 6px;
}
.cal-widget:not(.cal-compact) .fc .fc-day-today .fc-daygrid-day-number {
  background: var(--accent);
  color: #fff;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.cal-widget:not(.cal-compact) .fc .fc-daygrid-event {
  border-radius: 4px;
  font-size: 12px;
  padding: 1px 4px;
  margin: 1px 0;
}

/* 侧边栏 compact */
.cal-compact .fc {
  --fc-border-color: var(--border-light);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
  font-size: 10px;
  max-height: 360px;
  overflow-y: auto;
}
.cal-compact .fc .fc-daygrid-day-frame {
  padding: 0;
  min-height: 0 !important;
  height: auto;
}
.cal-compact .fc .fc-daygrid-day-top {
  flex-direction: row;
  justify-content: center;
  padding: 0;
}
.cal-compact .fc .fc-daygrid-day-number {
  font-size: 9px;
  color: var(--text);
  padding: 1px 2px;
}
.cal-compact .fc .fc-day-today .fc-daygrid-day-number {
  background: var(--accent);
  color: #fff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.cal-compact .fc .fc-daygrid-day-events {
  min-height: 0 !important;
}
.cal-compact .fc .fc-daygrid-event {
  border-radius: 2px;
  font-size: 7px;
  padding: 0 2px;
  margin: 0 0 1px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-compact .fc .fc-daygrid-more-link {
  font-size: 7px;
  padding: 0 2px;
}
.cal-compact .fc .fc-scrollgrid {
  border-left: none;
  border-right: none;
}
.cal-compact .fc .fc-col-header-cell-cushion {
  font-size: 9px;
  padding: 2px 0;
  color: var(--text-tertiary);
  font-weight: 600;
}
.cal-compact .fc .fc-day-other .fc-daygrid-day-number {
  color: var(--text-tertiary);
}
.cal-compact .fc .fc-header-toolbar {
  display: none;
}
</style>
