<template>
  <div id="app-root">
    <div class="tab-bar">
      <button :class="['tab-btn', { active: view === 'home' }]" @click="goHome">📋 项目</button>
      <button :class="['tab-btn', { active: view === 'calendar' }]" @click="goCalendar">📅 日历</button>
    </div>

    <HomeView
      v-show="view === 'home'"
      ref="homeRef"
      @open-project="openProject"
    />

    <ProjectDetail
      v-show="view === 'project'"
      v-if="projectId"
      :project-id="projectId"
      @back="goBack"
    />

    <div v-show="view === 'calendar'" class="calendar-page">
      <CalendarWidget :projects="allProjects" :sets="allSets" :compact="false" @select="openProject" @select-task="openTaskFromCalendar" />
    </div>

    <div id="toast-container"></div>

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
import CalendarWidget from "./components/CalendarWidget.vue";

const view = ref("home");
const projectId = ref(null);
const homeRef = ref(null);
const allProjects = ref([]);
const allSets = ref([]);
const historyStack = ref([]); // [{ view, projectId }]
const versionInfo = ref(null);

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

function goCalendar() {
  view.value = "calendar";
  projectId.value = null;
  historyStack.value = [];
  saveState();
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
  if (view.value === "home" || view.value === "calendar") {
    loadAllProjects();
    if (view.value === "home") nextTick(() => homeRef.value?.refresh?.());
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
  } else if (["home", "calendar"].includes(state.view)) {
    view.value = state.view;
    projectId.value = null;
    if (state.view === "home") nextTick(() => homeRef.value?.refresh?.());
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

  --accent: oklch(0.52 0.18 270);
  --accent-hover: oklch(0.48 0.2 270);
  --accent-subtle: oklch(0.92 0.04 270);

  --bg: oklch(0.965 0.006 270);
  --bg-card: oklch(0.995 0.003 270);
  --bg-hover: oklch(0.945 0.008 270);
  --bg-active: oklch(0.92 0.04 270);

  --text: oklch(0.2 0.015 270);
  --text-secondary: oklch(0.55 0.02 270);
  --text-tertiary: oklch(0.7 0.015 270);

  --border: oklch(0.9 0.008 270);
  --border-light: oklch(0.94 0.006 270);

  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.06);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 8px 30px oklch(0 0 0 / 0.1);

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
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

/* === Tab Bar === */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  padding: 0 16px;
  flex-shrink: 0;
  gap: 2px;
}
.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  transition: color var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
  letter-spacing: 0.02em;
}
.tab-btn:hover { color: var(--text); }
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

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

/* === Status Badges === */
.status-todo {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}
.status-doing {
  background: #dbeafe;
  color: #1e40af;
  border-color: #bfdbfe;
}
.status-done {
  background: #d1fae5;
  color: #065f46;
  border-color: #a7f3d0;
}
.status-delay {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}

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
  background: oklch(0.85 0.008 270);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover { background: oklch(0.75 0.01 270); }

/* === Selection === */
::selection { background: oklch(0.85 0.08 270 / 0.3); }

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

/* === Calendar Page === */
.calendar-page {
  flex: 1; display: flex; flex-direction: column;
  padding: 24px 20px; overflow-y: auto;
}
</style>
