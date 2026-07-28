<template>
  <div :class="['cal-widget', { 'cal-compact': compact }]">
    <FullCalendar :options="fcOptions" />
  </div>
</template>

<script setup>
import { computed } from "vue";
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

// ===== 事件映射：每个项目一个事件，让 FC 默认处理多日渲染 =====
const fcEvents = computed(() =>
  props.projects
    .map((p, idx) => {
      if (!p.planStart || !p.planEnd) return null;
      const endDate = new Date(p.planEnd);
      endDate.setDate(endDate.getDate() + 1); // FC 左闭右开
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
  height: props.compact ? "100%" : undefined,
  contentHeight: props.compact ? "100%" : undefined,
  dayMaxEvents: props.compact ? 2 : 3,
  headerToolbar: { left: "prev,next", center: "title", right: "" },
  editable: false,
  selectable: false,
  events: fcEvents.value,
  eventClick(info) {
    console.log("点击项目：", info.event.title);
  },
}));
</script>

<style scoped>
.cal-widget {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.cal-compact {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.cal-widget :deep(.fc) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.cal-widget :deep(.fc .fc-view-harness) {
  flex: 1;
}
</style>

<style>
/* ===== FullCalendar 全局样式覆盖 ===== */

/* ---------- 全页模式 ---------- */
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
  min-height: 100px;
}
.cal-widget:not(.cal-compact) .fc .fc-daygrid-day-number {
  font-size: 13px;
  color: var(--text);
  padding: 4px 6px;
}
/* 今日：淡蓝底 + 蓝色线框 + 加粗、无圆圈 */
.cal-widget:not(.cal-compact) .fc .fc-day-today {
  background: oklch(0.94 0.04 240) !important;
  position: relative;
}
.cal-widget:not(.cal-compact) .fc .fc-day-today::before {
  content: '';
  position: absolute;
  inset: 1px;
  border: 1.5px solid oklch(0.55 0.15 240);
  border-radius: 4px;
  pointer-events: none;
  z-index: 2;
}
.cal-widget:not(.cal-compact) .fc .fc-day-today .fc-daygrid-day-number {
  background: transparent !important;
  color: oklch(0.35 0.15 240) !important;
  font-weight: 700;
  border-radius: 0;
  width: auto;
  height: auto;
  display: inline;
  padding: 4px 6px;
}
.cal-widget:not(.cal-compact) .fc .fc-daygrid-event {
  border-radius: 4px;
  font-size: 12px;
  padding: 1px 4px;
  margin: 1px 0;
}

/* ---------- 侧边栏 compact ---------- */
.cal-compact .fc {
  --fc-border-color: var(--border-light);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
  font-size: 10px;
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
/* 今日：淡蓝底 + 蓝色线框 + 加粗、无圆圈 */
.cal-compact .fc .fc-day-today {
  background: oklch(0.94 0.04 240) !important;
  position: relative;
}
.cal-compact .fc .fc-day-today::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 1.5px solid oklch(0.55 0.15 240);
  border-radius: 3px;
  pointer-events: none;
  z-index: 2;
}
.cal-compact .fc .fc-day-today .fc-daygrid-day-number {
  background: transparent !important;
  color: oklch(0.35 0.15 240) !important;
  font-weight: 700;
  border-radius: 0;
  width: auto;
  height: auto;
  display: inline;
  padding: 1px 2px;
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
  padding: 6px 8px;
  gap: 4px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cal-compact .fc .fc-toolbar-title {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  flex: 1;
  margin: 0;
}
.cal-compact .fc .fc-toolbar-chunk {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
}
.cal-compact .fc .fc-button {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--bg-card);
  border-color: var(--border-light);
  color: var(--text);
}
.cal-compact .fc .fc-button:hover {
  background: var(--bg-hover);
}
.cal-compact .fc .fc-button:focus {
  box-shadow: none;
}
</style>