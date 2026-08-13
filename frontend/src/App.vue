<template>
  <div id="app-root">
    <HomeView
      v-show="view === 'home'"
      ref="homeRef"
      @open-project="openProject"
      @go-calendar="goCalendar"
    />

    <ProjectDetail
      v-show="view === 'project'"
      v-if="projectId"
      :project-id="projectId"
      @back="goBack"
    />

    <div id="toast-container"></div>

    <!-- 全项目日历弹窗（统一弹窗形式；列表页按钮 / 详情页入口共用） -->
    <CalendarModal
      v-model="calendarShow"
      :projects="allProjects"
      :sets="allSets"
      @select="(id) => { calendarShow = false; openProject(id) }"
      @select-task="(payload) => { calendarShow = false; openTaskFromCalendar(payload) }"
    />

    <div
      v-if="versionInfo"
      class="version-badge"
      :title="`FE built: ${versionInfo.frontendBuiltAt}\nBE loaded: ${versionInfo.loadedAt || 'unknown (BE not reloaded yet)'}`"
    >
      <span class="ver">v{{ versionInfo.version }}</span>
      <span class="src">({{ versionInfo.source }}{{ versionInfo.fallback ? '·fb' : '' }})</span>
      <span class="sep">·</span>
      <span class="t">FE {{ formatTime(versionInfo.frontendBuiltAt) }}</span>
      <span class="sep">·</span>
      <span class="t">BE {{ versionInfo.loadedAt ? formatTime(versionInfo.loadedAt) : '—' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from "vue";
import { api, reportHeight, getVersion } from "./api.js";
import HomeView from "./views/Home/index.vue";
import ProjectDetail from "./views/Project/index.vue";
import CalendarModal from "./components/CalendarModal.vue";

const view = ref("home");
const projectId = ref(null);
const homeRef = ref(null);
const allProjects = ref([]);
const allSets = ref([]);
const historyStack = ref([]); // [{ view, projectId }]
const versionInfo = ref(null);
const calendarShow = ref(false); // 全项目日历弹窗

function formatTime(iso) {
  if (!iso) return "-";
  // 渲染为本地时区的 HH:MM
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function loadAllProjects() {
  const [pr, sr] = await Promise.all([
    api("api/projects"),
    api("api/project-sets"),
  ]);
  if (pr?.ok) allProjects.value = pr.data || [];
  if (sr?.ok) allSets.value = sr.data || [];
}

function goHome() {
  view.value = "home";
  projectId.value = null;
  historyStack.value = [];
  saveState();
  loadAllProjects();
  nextTick(() => homeRef.value?.refresh?.());
}

// 列表页「前往日历」：改为弹窗（不再切独立路由视图）
function goCalendar() {
  calendarShow.value = true;
  loadAllProjects();
}

function openProject(id) {
  // 记录当前状态，返回时跳转
  if (view.value !== "project" || projectId.value !== id) {
    historyStack.value.push({ view: view.value, projectId: projectId.value });
  }
  projectId.value = id;
  view.value = "project";
  saveState();
}

function openTaskFromCalendar({ projectId: pid, taskId }) {
  // 先记录待滚动任务，项目详情加载完成后由 ProjectDetail 消费
  if (taskId) {
    try { sessionStorage.setItem("neo-pm-scroll-task", taskId); } catch { /* ignore */ }
  }
  openProject(pid);
}

function goBack() {
  const prev = historyStack.value.pop();
  if (prev) {
    view.value = prev.view;
    projectId.value = prev.projectId;
  } else {
    view.value = "home";
    projectId.value = null;
  }
  saveState();
  if (view.value === "home") {
    loadAllProjects();
    nextTick(() => homeRef.value?.refresh?.());
  }
}

// ===== Persistence =====
const STORAGE_KEY = "neo-pm-state";
const STATE_VERSION = 1;
let saveTimer = null;

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: STATE_VERSION,
        view: view.value,
        projectId: projectId.value,
        historyStack: historyStack.value.slice(-10), // 上限保护
      }));
    } catch { /* ignore */ }
  }, 300);
}

async function restoreState() {
  let state = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    state = JSON.parse(raw);
    if (!state || state.v !== STATE_VERSION) return;
  } catch { return; }
  if (!state) return;

  // 恢复路由栈
  if (Array.isArray(state.historyStack)) {
    historyStack.value = state.historyStack.filter(s => s && typeof s.view === "string");
  }

  // 恢复视图；项目详情页需校验项目是否还存在
  if (state.view === "project" && state.projectId) {
    try {
      const res = await api(`api/projects/${state.projectId}`);
      if (res?.ok) {
        projectId.value = state.projectId;
        view.value = "project";
      } else {
        // 项目不存在或被删除，重置
        historyStack.value = [];
      }
    } catch { /* keep default */ }
  } else if (state.view === "home") {
    view.value = "home";
    projectId.value = null;
    nextTick(() => homeRef.value?.refresh?.());
  }
  // calendar 视图已改为弹窗：旧存档回退 home
  if (view.value === "calendar") {
    view.value = "home";
    projectId.value = null;
  }
}

onMounted(async () => {
  window.parent.postMessage({ source: "hana-plugin", type: "ready" }, "*");
  await restoreState();
  loadAllProjects();
  reportHeight();
  const ro = new ResizeObserver(() => reportHeight());
  ro.observe(document.body);
  // 异步拉版本号，不阻塞主流程；失败时静态注入值兜底
  getVersion().then((v) => { if (v) versionInfo.value = v; }).catch(() => {});
});
</script>

<style>
/* === Design Tokens === */
:root {
  --font-sans: "DM Sans", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "DM Mono", monospace;

  /* === 黑白灰主题：克制冷静 === */
  --accent: oklch(0.5 0 0);
  --accent-hover: oklch(0.35 0 0);
  --accent-subtle: oklch(0.93 0 0);

  /* 琥珀强调（唯一暖色点缀：导航激活、进度满格） */
  --accent-warm: #d97706;
  --accent-warm-hover: #b45309;
  --accent-warm-subtle: oklch(0.95 0.03 75);

  /* 链接/可点击名称（归档表格项目名等） */
  --link: oklch(0.5 0.19 255);

  --bg: oklch(0.975 0 0);
  --bg-card: oklch(1 0 0);
  --bg-hover: oklch(0.945 0 0);
  --bg-active: oklch(0.9 0 0);

  --text: oklch(0.21 0 0);
  --text-secondary: oklch(0.45 0 0);
  --text-tertiary: oklch(0.62 0 0);

  --border: oklch(0.87 0 0);
  --border-light: oklch(0.92 0 0);

  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.06);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 8px 30px oklch(0 0 0 / 0.1);
  --shadow-raised: 0 4px 16px oklch(0 0 0 / 0.14);  /* 浮起层级（编辑态便利贴） */

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;

  /* === 间距体系（4/8/12/16/24/32） === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* === 状态语义色（鲜亮糖果色） === */
  --status-todo-text: oklch(0.77 0.19 70);
  --status-doing-text: oklch(0.62 0.21 255);
  --status-done-text: oklch(0.70 0.17 162);
  --status-delay-text: oklch(0.64 0.24 25);
  --status-cancel-text: oklch(0.52 0 0);   /* 已取消：中性灰（标识不做的项目） */

  /* === 危险操作 / 错误提示（删除 hover、错误文字、逾期强调） === */
  --danger: oklch(0.55 0.22 25);

  /* === 便利贴（批注卡片）专用底色：黄=待确认，绿=已确认 === */
  --sticky-bg: oklch(0.95 0.10 90);
  --sticky-bg-confirmed: oklch(0.93 0.10 145);

  /* === 固定前景/表层色（不随主题翻转，因对应底色为固定色板或第三方组件） === */
  --on-avatar: oklch(0.28 0 0);        /* 成员头像前景（头像底色为 script 固定调色板） */
  --calendar-bg: oklch(0.98 0 0);      /* 日历表层（FullCalendar 文字色不随主题翻转，表层独立） */
}

/* === 暗色主题预留框架（启用：根元素加 data-theme="dark"） === */
[data-theme="dark"] {
  --accent: oklch(0.75 0 0);
  --accent-hover: oklch(0.85 0 0);
  --accent-subtle: oklch(0.28 0 0);

  --bg: oklch(0.17 0 0);
  --bg-card: oklch(0.21 0 0);
  --bg-hover: oklch(0.25 0 0);
  --bg-active: oklch(0.3 0 0);

  --text: oklch(0.92 0 0);
  --text-secondary: oklch(0.72 0 0);
  --text-tertiary: oklch(0.55 0 0);

  --border: oklch(0.32 0 0);
  --border-light: oklch(0.27 0 0);
}

/* === Reset polished === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }
body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
#app-root { height: 100%; display: flex; flex-direction: column; }
button { font-family: inherit; cursor: pointer; }
input, textarea, select { font-family: inherit; }

/* === Global Components === */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h2 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.btn-icon {
  width: 30px; height: 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--accent);
  border-color: var(--accent);
}

/* === Status Text Colors（圆点/文字风格，无底色） === */
.status-todo { color: var(--status-todo-text); }
.status-doing { color: var(--status-doing-text); }
.status-done { color: var(--status-done-text); }
.status-delay { color: var(--status-delay-text); }

/* === Empty State === */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-tertiary);
  font-size: 14px;
}

/* === Scrollbar === */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: oklch(0.85 0 0);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover { background: oklch(0.75 0 0); }

/* === Selection === */
::selection { background: oklch(0.88 0 0 / 0.35); }

/* === Version Badge === */
.version-badge {
  position: fixed;
  bottom: 6px;
  right: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-tertiary);
  background: oklch(0.99 0.003 270 / 0.7);
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: auto;
  z-index: 999;
  letter-spacing: 0.02em;
  user-select: text;
}
.version-badge .ver { color: var(--accent); font-weight: 600; }
.version-badge .src { color: var(--text-secondary); }
.version-badge .sep { color: var(--border); margin: 0 4px; }
.version-badge .t { color: var(--text-tertiary); }

/* === Calendar Page（已改弹窗，样式保留无引用可删） === */
.calendar-page {
  flex: 1; display: flex; flex-direction: column;
  padding: 24px 20px; overflow-y: auto;
}
.calendar-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.crumb-sep {
  color: var(--text-tertiary);
  font-size: 12px;
  user-select: none;
}
.crumb-item {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: default;
  white-space: nowrap;
}
.crumb-root {
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}
.crumb-root:hover { color: var(--text); }
.crumb-current {
  color: var(--text);
  font-weight: 600;
}
.btn-back {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-card);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.btn-back:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border);
}
</style>
