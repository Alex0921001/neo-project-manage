<template>
  <div :class="['cal-widget', { 'cal-compact': compact }]">
    <!-- 自定义 header：筛选（独立页）+ 时间控制器，同一行 -->
    <div class="cal-header">
      <div v-if="!compact" class="cal-filter">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          :class="['cal-filter-btn', { active: calFilter === opt.value }]"
          @click="calFilter = opt.value"
        >{{ opt.label }}</button>
      </div>
      <div class="cal-nav">
        <button class="cal-nav-btn" title="上个月" @click="goPrev">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <span class="cal-title">{{ currentTitle }}</span>
        <button class="cal-nav-btn" title="下个月" @click="goNext">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
    <FullCalendar ref="calendarRef" :options="fcOptions" />
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
  sets: { type: Array, default: () => [] },
  compact: { type: Boolean, default: true },
});
const emit = defineEmits(["select"]);

const calendarRef = ref(null);
const currentTitle = ref("");
const calFilter = ref("undone");
const filterOptions = [
  { value: "all", label: "全部" },
  { value: "undone", label: "未完成" },
  { value: "done", label: "已完成" },
];

// ===== 项目状态筛选（仅独立页非 compact 生效）=====
const visibleProjects = computed(() => {
  if (props.compact || calFilter.value === "all") return props.projects;
  const done = calFilter.value === "done";
  return props.projects.filter((p) =>
    done ? p.status === "已完成" : p.status !== "已完成"
  );
});

function getSetName(projectSetId) {
  if (!projectSetId) return "";
  const set = props.sets.find((s) => s.id === projectSetId);
  return set ? set.name : "";
}

// ===== 事件映射（低饱和糖果色调色板）=====
import { candyPalette as palette } from "../../../utils/palette.js";
const fcEvents = computed(() =>
  visibleProjects.value
    .map((p, idx) => {
      if (!p.planStart || !p.planEnd) return null;
      const endDate = new Date(p.planEnd);
      endDate.setDate(endDate.getDate() + 1); // FC 左闭右开
      const setName = getSetName(p.projectSetId);
      const projectName = p.name || "未命名";
      const title = setName ? `${setName}-${projectName}` : projectName;
      const color = palette[idx % palette.length];
      return {
        title,
        start: p.planStart,
        end: endDate.toISOString().slice(0, 10),
        backgroundColor: color,
        borderColor: color,
        textColor: "#fff",
        extendedProps: { projectId: p.id, projectName, setName },
      };
    })
    .filter(Boolean)
);

// ===== FullCalendar 选项（内置 header 关闭，用自定义 header）=====
const fcOptions = computed(() => ({
  plugins: [dayGridPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  locale: zhCn,
  height: props.compact ? "auto" : undefined,
  dayMaxEvents: props.compact ? 1 : 3,
  headerToolbar: false,
  editable: false,
  selectable: false,
  events: fcEvents.value,
  datesSet: (info) => {
    const d = info.view.currentStart;
    currentTitle.value = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  },
  eventClick(info) {
    const pid = info.event.extendedProps?.projectId;
    if (pid) emit("select", pid);
  },
}));

function goPrev() { calendarRef.value?.getApi()?.prev(); }
function goNext() { calendarRef.value?.getApi()?.next(); }
</script>

<style scoped>
.cal-widget {
  background: #fff;
  /* 完整外框 + 圆角：表头左右边框和四角圆角都由这里提供 */
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

/* compact 模式 header 更舒展，箭头两端撑开 */
.cal-compact .cal-header {
  padding: 10px 16px;
}
.cal-compact .cal-nav {
  position: static;
  transform: none;
  width: 100%;
  justify-content: space-between;
  gap: 8px;
}
.cal-compact .cal-nav-btn {
  width: 28px;
  height: 28px;
}
.cal-compact .cal-title {
  font-size: 14px;
  flex: 1;
  min-width: 0;
}
/* compact 日期格子留白 */
.cal-compact :deep(.fc .fc-daygrid-day-frame) {
  padding: 2px;
}
.cal-compact :deep(.fc .fc-daygrid-day-number) {
  font-size: 12px;
  padding: 3px 4px;
  white-space: nowrap;
}
/* compact 事件条压缩固定高度，行高均匀 */
.cal-compact :deep(.fc .fc-daygrid-event) {
  font-size: 11px;
  min-height: 18px;
  line-height: 18px;
  padding: 0 4px;
  margin: 1px 2px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-compact :deep(.fc .fc-daygrid-day-events) {
  min-height: 0;
}

/* 自定义 header：筛选（左）+ 时间控制（居中），同一行不折行 */
/* border-bottom：header 与日历区之间的分隔线（fc 顶线已去掉，无双线） */
.cal-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: nowrap;
}
.cal-filter {
  display: inline-flex;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
}
.cal-filter-btn {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease-out;
  white-space: nowrap;
}
.cal-filter-btn:hover { background: var(--bg-hover); }
.cal-filter-btn.active {
  background: var(--accent);
  color: #fff;
}

/* 时间控制器：< 年-月 > 绝对居中 */
.cal-nav {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.cal-nav-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease-out;
}
.cal-nav-btn:hover { background: var(--bg-hover); }
.cal-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
  min-width: 96px;
  text-align: center;
  white-space: nowrap;
}

.cal-widget :deep(.fc) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.cal-widget :deep(.fc .fc-view-harness) {
  flex: 1;
  overflow: hidden;
}
/* 消灭内部滚动条（高度已给足，内容不外溢） */
.cal-widget :deep(.fc .fc-scroller) {
  overflow: hidden !important;
}
</style>

<style>
/* ===== FullCalendar 全局样式覆盖 ===== */
.cal-widget .fc {
  --fc-border-color: #e5e7eb;
  --fc-page-bg-color: #fff;
  --fc-neutral-bg-color: #fff;
  --fc-today-bg-color: rgba(255, 193, 7, 0.12);
}
/* fc 外框与 section 全去边框，外沿统一由 .cal-widget 的 1px 边框 + 圆角提供 */
.cal-widget .fc .fc-scrollgrid,
.cal-widget .fc .fc-scrollgrid-section > td,
.cal-widget .fc .fc-scrollgrid-section > th {
  border: none;
}
/* 网格线：每格只保留右下 1px，避免与外框叠加成粗线 */
.cal-widget .fc .fc-col-header-cell,
.cal-widget .fc .fc-daygrid-day {
  border: none;
  border-right: 1px solid var(--fc-border-color);
  border-bottom: 1px solid var(--fc-border-color);
}
/* 外沿补齐：最后一列无右边框（widget 右边框接管） */
.cal-widget .fc .fc-col-header-cell:last-child,
.cal-widget .fc .fc-daygrid-day:last-child {
  border-right: none;
}
/* 外沿补齐：最后一行无底边框（widget 底边框接管） */
.cal-widget .fc .fc-daygrid-body .fc-daygrid-row:last-child .fc-daygrid-day {
  border-bottom: none;
}
.cal-widget:not(.cal-compact) .fc {
  font-size: 14px;
}
</style>
