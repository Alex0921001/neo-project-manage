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
import { ref, computed, watch, onMounted, onErrorCaptured, nextTick } from "vue";
import FullCalendar from "@fullcalendar/vue3";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import zhCn from "@fullcalendar/core/locales/zh-cn";
import dayjs from "dayjs";
import { api } from "../../../api.js";
import { candyPalette as palette } from "../../../utils/palette.js";

const props = defineProps({
  projects: { type: Array, default: () => [] },
  sets: { type: Array, default: () => [] },
  compact: { type: Boolean, default: true },
  taskMode: { type: Boolean, default: false }, // true = 事件源为任务（日历 tab）
  projectId: { type: String, default: "" },   // taskMode 且非空 = 限定单项目
});
const emit = defineEmits(["select", "select-task"]);

// 捕获子组件（FullCalendar）渲染错误：记录日志并阻止向上传播，避免整页白屏
// 注意：Vue 3 中 return false 才是“阻止继续向上传播”（原注释写反了）
onErrorCaptured((err, instance, info) => {
  console.error("[CalendarWidget] 子组件错误:", err, info);
  return false; // 阻止继续传播，保持页面其余部分可用
});

const calendarRef = ref(null);
const currentTitle = ref("");
const calFilter = ref("undone");
const filterOptions = [
  { value: "all", label: "全部" },
  { value: "undone", label: "未完成" },
  { value: "done", label: "已完成" },
];

// ===== 任务数据源（taskMode）=====
const taskEvents = ref([]);

async function loadTaskEvents() {
  if (!props.taskMode) return;
  try {
    // 按当前筛选拉取（后端按 status 过滤），避免拉回全量再本地过滤
    const status = calFilter.value;
    const url = props.projectId
      ? `api/projects/${props.projectId}/calendar-tasks?status=${encodeURIComponent(status)}`
      : `api/calendar-tasks?status=${encodeURIComponent(status)}`;
    const res = await api(url);
    if (res?.ok && Array.isArray(res.data)) {
      taskEvents.value = res.data;
    } else {
      taskEvents.value = [];
      console.error("[CalendarWidget] 拉取任务日历失败:", res?.error || res?.data);
    }
  } catch (e) {
    taskEvents.value = [];
    console.error("[CalendarWidget] 拉取任务日历异常:", e);
  }
}

onMounted(() => {
  if (props.taskMode) {
    loadTaskEvents().then(() => {
      // 问题3：v-if 挂载后强制 FC 重新计算尺寸（非 flex 容器下 flex:1 无效）
      nextTick(() => {
        try { calendarRef.value?.getApi()?.updateSize(); } catch (e) { console.error("[CalendarWidget] updateSize 失败:", e); }
      });
    });
  }
});
// 监听 ref 本身（此前误写成 props.calFilter，源恒 undefined 永不触发）
watch(calFilter, () => {
  if (!props.taskMode) return;
  loadTaskEvents().then(() => {
    nextTick(() => {
      try { calendarRef.value?.getApi()?.updateSize(); } catch (e) { console.error("[CalendarWidget] updateSize 失败:", e); }
    });
  });
});
watch(() => props.projectId, () => { if (props.taskMode) loadTaskEvents(); });

// ===== 项目状态筛选（非 taskMode，仅独立页非 compact 生效）=====
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

// ===== 事件映射 =====
// 任务模式：taskEvents（按 calFilter 本地再过滤一次，后端已按 status 过滤，这里兜底）
const visibleTaskEvents = computed(() => {
  const list = Array.isArray(taskEvents.value) ? taskEvents.value : [];
  if (calFilter.value === "all") return list;
  const done = calFilter.value === "done";
  return list.filter((t) => done ? t.done : !t.done);
});

const fcEvents = computed(() => {
  try {
    if (props.taskMode) {
      return visibleTaskEvents.value.map((t, idx) => {
        const start = t.startDate || t.endDate;
        const endRaw = t.endDate || t.startDate;
        // FC 左闭右开：用 dayjs 纯日期运算 +1 天，避免 UTC/本地时区偏差（P3-3）
        const end = dayjs(endRaw).add(1, "day").format("YYYY-MM-DD");
        const color = palette[idx % palette.length];
        return {
          title: t.name || "未命名任务",
          start,
          end,
          backgroundColor: color,
          borderColor: color,
          textColor: "#fff",
          extendedProps: { projectId: t.projectId, taskId: t.id, projectName: t.projectName },
        };
      });
    }
    // 项目模式（问题2：用 visibleProjects 让「全部/未完成/已完成」筛选生效）
    return (Array.isArray(visibleProjects.value) ? visibleProjects.value : [])
      .map((p, idx) => {
        if (!p.planStart || !p.planEnd) return null;
        // FC 左闭右开：用 dayjs 纯日期运算 +1 天，避免 UTC/本地时区偏差（P3-3）
        const endDate = dayjs(p.planEnd).add(1, "day").format("YYYY-MM-DD");
        const setName = getSetName(p.projectSetId);
        const projectName = p.name || "未命名";
        const title = setName ? `${setName}-${projectName}` : projectName;
        const color = palette[idx % palette.length];
        return {
          title,
          start: p.planStart,
          end: endDate,
          backgroundColor: color,
          borderColor: color,
          textColor: "#fff",
          extendedProps: { projectId: p.id, projectName, setName },
        };
      })
      .filter(Boolean);
  } catch (e) {
    // 防御：事件计算失败不拖垮整页（P0-1）
    console.error("[CalendarWidget] 事件计算失败:", e);
    return [];
  }
});

// ===== FullCalendar 选项（内置 header 关闭，用自定义 header）=====
const fcOptions = computed(() => ({
  plugins: [dayGridPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  locale: zhCn,
  // 高度：compact（侧边小日历）用 100% 铺满父容器；非 compact（日历 tab / 大日历页）固定 600
  height: props.compact ? "100%" : 600,
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
    const ep = info.event.extendedProps || {};
    if (props.taskMode) {
      if (ep.projectId && ep.taskId) emit("select-task", { projectId: ep.projectId, taskId: ep.taskId });
      return;
    }
    if (ep.projectId) emit("select", ep.projectId);
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
