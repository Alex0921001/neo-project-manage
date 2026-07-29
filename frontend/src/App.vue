<template>
  <div id="app-root">
    <div class="tab-bar">
      <button :class="['tab-btn', { active: view === 'home' }]" @click="goHome">📋 项目</button>
      <button :class="['tab-btn', { active: view === 'calendar' }]" @click="goCalendar">📅 日历</button>
      <button :class="['tab-btn', { active: view === 'zentao' }]" @click="goZentao">🐞 禅道</button>
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
      <CalendarWidget :projects="allProjects" :sets="allSets" :compact="false" @select="openProject" />
    </div>

    <ZentaoView v-show="view === 'zentao'" />

    <div id="toast-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from "vue";
import { api, reportHeight } from "./api.js";
import HomeView from "./views/Home/index.vue";
import ProjectDetail from "./views/Project/index.vue";
import ZentaoView from "./views/Zentao/index.vue";
import CalendarWidget from "./views/Project/components/CalendarWidget.vue";

const view = ref("home");
const projectId = ref(null);
const homeRef = ref(null);
const allProjects = ref([]);
const allSets = ref([]);
const historyStack = ref([]); // [{ view, projectId }]

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

function goZentao() {
  view.value = "zentao";
  projectId.value = null;
  historyStack.value = [];
  saveState();
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
  } else if (["home", "calendar", "zentao"].includes(state.view)) {
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

/* === Shared Modal === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.35);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlayIn 150ms var(--ease-out);
}
@keyframes overlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.modal {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: 24px;
  min-width: 400px;
  max-width: 480px;
  box-shadow: var(--shadow-lg);
  animation: modalIn 250ms var(--ease-out);
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.modal h3 { font-size: 16px; font-weight: 600; margin-bottom: 20px; }
.modal label {
  display: block; font-size: 12px; font-weight: 600;
  margin-bottom: 4px; color: var(--text-secondary);
  letter-spacing: 0.02em; text-transform: uppercase;
}
.modal input, .modal textarea, .modal select {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px; margin-bottom: 14px;
  background: var(--bg-card); color: var(--text);
  outline: none;
  transition: border-color 150ms, box-shadow 150ms;
}
.modal input:focus, .modal textarea:focus, .modal select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
.modal textarea { min-height: 60px; resize: vertical; }
.modal .form-row { display: flex; gap: 12px; }
.modal .form-row > * { flex: 1; }
.modal-actions {
  display: flex; justify-content: flex-end;
  gap: 8px; margin-top: 16px;
}
.modal-actions button {
  padding: 8px 18px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); cursor: pointer;
  font-size: 13px; font-weight: 500;
  transition: all 150ms var(--ease-out);
}
.modal-actions button:not(.btn-primary):hover { background: var(--bg-hover); }
.modal-actions .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.modal-actions .btn-primary:hover { background: var(--accent-hover); }
.modal-actions .btn-danger { background: oklch(0.5 0.18 30); color: #fff; border-color: oklch(0.5 0.18 30); }
.modal-actions .btn-danger:hover { background: oklch(0.45 0.2 30); }
.modal-wide { max-width: 600px; width: 90%; }

/* === Calendar Page === */
.calendar-page {
  flex: 1; display: flex; flex-direction: column;
  padding: 24px 20px; overflow-y: auto;
}
</style>
