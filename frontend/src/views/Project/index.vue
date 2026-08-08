<template>
  <div class="detail-view">
    <!-- 主区：左侧详情卡 + 右侧 sticky 日历 -->
    <div class="detail-main">
      <div class="detail-left">
        <ProjectMeta :project="p" :set-label="currentSetLabel" @edit="showEditModal = true" @back="$emit('back')" @change-status="changeStatus" />
      </div>
      <div class="detail-right">
        <CalendarWidget :projects="p ? [p] : []" />
      </div>
    </div>

    <!-- Tab 区 -->
    <section class="tab-section">
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          任务
          <span class="tab-pill">{{ incompleteCount }}</span>
        </button>
        <button class="tab-btn" :class="{ active: tab === 'calendar' }" @click="tab = 'calendar'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          日历
        </button>
        <button class="tab-btn" :class="{ active: tab === 'files' }" @click="tab = 'files'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          文件
          <span class="tab-pill">{{ (p?.files || []).length }}</span>
        </button>
        <button class="tab-btn" :class="{ active: tab === 'notes' }" @click="tab = 'notes'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          备注
          <span class="tab-pill">{{ (p?.notes || []).length }}</span>
        </button>
        <div class="tab-bar-spacer"></div>
        <div class="tab-bar-right">
          <div v-if="tab === 'tasks'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="taskSearch" class="task-search-input" placeholder="搜索任务" @click.stop />
            <button v-if="taskSearch" class="task-search-clear" title="清空" @click="taskSearch = ''">×</button>
          </div>
          <select v-if="tab === 'tasks'" v-model="taskFilter" class="task-filter-select" @click.stop>
            <option value="all">全部任务</option>
            <option value="incomplete">仅未完成</option>
            <option value="done">仅已完成</option>
          </select>
          <button v-if="tab === 'tasks'" class="header-btn" @click="toggleExpandAll" title="展开或收起全部任务">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline v-if="expandAll" points="6 15 12 9 18 15"></polyline>
              <polyline v-else points="6 9 12 15 18 9"></polyline>
            </svg>
            {{ expandAll ? '收起' : '展开' }}
          </button>
          <button v-if="tab !== 'calendar'" class="header-btn header-btn-primary" @click="onTabAction">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建
          </button>
        </div>
      </div>
      <div class="tab-content">
        <!-- 问题2：v-if 替代 v-show，避免 FC 在 display:none 容器中渲染 0 尺寸 -->
        <div v-if="tab === 'calendar'" class="task-calendar-tab">
          <CalendarWidget
            :projects="p ? [p] : []"
            :sets="allSets"
            :compact="false"
            task-mode
            :project-id="p?.id || ''"
            @select-task="onTabCalendarSelectTask"
          />
        </div>
        <TaskTab
          v-show="tab === 'tasks'"
          ref="taskTabRef"
          :project-id="p?.id || ''"
          :tasks="filteredTasks"
          :files="p?.files || []"
          :members="p?.members || []"
          :plan-start="p?.planStart || ''"
          :plan-end="p?.planEnd || ''"
          :search-query="taskSearch"
          :expand-all="expandAll"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <FileTab
          v-show="tab === 'files'"
          ref="fileTabRef"
          :project-id="p?.id || ''"
          :files="p?.files || []"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <NoteTab
          v-show="tab === 'notes'"
          ref="noteTabRef"
          :project-id="p?.id || ''"
          :notes="p?.notes || []"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
      </div>
    </section>

    <ProjectFormModal
      :show="showEditModal"
      mode="edit"
      :data="p"
      :sets="allSets"
      @close="showEditModal = false"
      @save="doEditProject"
    />

    <ConfirmModal
      :show="confirm.show"
      :message="confirm.message"
      @close="confirm.show = false"
      @confirm="doConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { api } from "../../api.js";
import { toast } from "../../toast.js";
import ProjectMeta from "./components/ProjectMeta.vue";
import TaskTab from "./components/TaskTab.vue";
import FileTab from "./components/FileTab.vue";
import NoteTab from "./components/NoteTab.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";
import ProjectFormModal from "../Home/components/ProjectFormModal.vue";
import CalendarWidget from "./components/CalendarWidget.vue";

const props = defineProps({ projectId: String });
const emit = defineEmits(["back"]);

const p = ref(null);
const allSets = ref([]);
const taskTabRef = ref(null);
const fileTabRef = ref(null);
const noteTabRef = ref(null);

const incompleteCount = computed(() => (p.value?.tasks || []).filter(t => !t.done).length);

const currentSetLabel = computed(() => {
  if (!p.value?.projectSetId) return "";
  const s = allSets.value.find(s => s.id === p.value.projectSetId);
  return s ? s.name : "";
});
const fullBreadcrumb = computed(() => {
  if (!p.value) return "加载中...";
  const name = p.value.name || "";
  return currentSetLabel.value ? `${currentSetLabel.value} - ${name}` : name;
});

// ===== Tab =====
const tabKey = `neo-pm-tab-${props.projectId}`;
const tab = ref(localStorage.getItem(tabKey) || "tasks");
watch(tab, (v) => { try { localStorage.setItem(tabKey, v); } catch {} });

// ===== 一键展开/收起 =====
// null = 未操作（子任务按默认：未完成展开、已完成折叠）；true/false = 显式展开/收起
const expandAll = ref(null);
function toggleExpandAll() {
  expandAll.value = !expandAll.value;
}

// ===== 任务筛选 =====
// 状态筛选在 index（全部/仅未完成/仅已完成）；关键词搜索过滤统一在 TaskTab 内完成（避免双份过滤逻辑）
const taskFilter = ref("all");
const taskSearch = ref("");

const filteredTasks = computed(() => {
  let arr = p.value?.tasks || [];
  if (taskFilter.value === "incomplete") arr = arr.filter(t => !t.done);
  else if (taskFilter.value === "done") arr = arr.filter(t => t.done);
  return arr;
});

// ===== Load =====
async function loadProject() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}`);
  if (!res?.ok) { toast("项目不存在", "error"); emit("back"); return; }
  p.value = res.data;
  // 消费日历跳转标记：切到任务 tab 并滚动定位到目标任务
  let scrollId = null;
  try { scrollId = sessionStorage.getItem("neo-pm-scroll-task"); sessionStorage.removeItem("neo-pm-scroll-task"); } catch { /* ignore */ }
  if (scrollId) {
    if (tab.value !== "tasks") tab.value = "tasks";
    nextTick(() => taskTabRef.value?.scrollToTaskById?.(scrollId));
  }
}
async function loadSets() {
  const res = await api("api/project-sets");
  if (res?.ok) allSets.value = res.data || [];
}
watch(() => props.projectId, () => { loadProject(); loadSets(); }, { immediate: true });

// ===== Edit Project =====
const showEditModal = ref(false);

async function changeStatus(status) {
  if (!p.value) return;
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ status }) });
  if (res.ok) { toast(`状态已切换为「${status}」`); loadProject(); }
  else toast(res.error || "状态切换失败", "error");
}

function onTabAction() {
  if (tab.value === 'tasks') taskTabRef.value?.openAdd();
  else if (tab.value === 'files') fileTabRef.value?.pickFile();
  else if (tab.value === 'notes') noteTabRef.value?.openAdd();
}

// 日历 tab 点击任务：切回任务 tab 并滚动定位（与 App.vue 大日历一致）
function onTabCalendarSelectTask({ taskId }) {
  if (!taskId) return;
  tab.value = "tasks";
  nextTick(() => taskTabRef.value?.scrollToTaskById?.(taskId));
}
async function doEditProject(d) {
  if (!d.name.trim()) return toast("请输入名称", "error");
  const members = d.members || [];
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ name: d.name.trim(), description: d.description.trim(), planStart: d.planStart, planEnd: d.planEnd, status: d.status, projectSetId: d.projectSetId, members }) });
  if (res.ok) { toast("已更新"); showEditModal.value = false; loadProject(); }
  else toast(res.error || "更新失败", "error");
}

// ===== Confirm =====
const confirm = ref({ show: false, message: "", action: "", payload: null });
function onConfirm(e) { confirm.value = { show: true, message: e.message, action: e.action, payload: e.payload }; }
async function doConfirm() {
  const { action, payload } = confirm.value;
  confirm.value.show = false;
  let res;
  if (action === "delete-task") {
    res = await api(`api/projects/${props.projectId}/tasks/${payload}`, { method: "DELETE" });
  } else if (action === "delete-file") {
    res = await api(`api/projects/${props.projectId}/files/${payload}`, { method: "DELETE" });
  } else if (action === "delete-note") {
    res = await api(`api/projects/${props.projectId}/notes/${payload}`, { method: "DELETE" });
  }
  if (res?.ok) { toast("已删除"); loadProject(); }
  else if (res) toast(res.error || "删除失败", "error");
}
</script>

<style scoped>
.detail-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: #f9fafb;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.detail-view::-webkit-scrollbar { display: none; }

/* ===== 主区 ===== */
.detail-main {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 16px;
  padding: 20px 24px;
  overflow: visible;
  /* 默认 stretch：左右两列等高对齐；右侧日历贴合月历内容高度，左侧拉伸到等高（meta-grid 1fr 吸收留白） */
}
.detail-left { min-width: 0; display: flex; flex-direction: column; }
.detail-right { min-width: 0; } /* 非 flex 容器：日历高度贴合月历内容，不被拉伸；align-items:start 保证不被左侧撑高 */

/* ===== Tab 区 ===== */
.tab-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  margin: 0 24px 24px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  clip-path: inset(0 round 14px);
}
.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  font-family: inherit;
  transition: all 0.15s ease-out;
}
.tab-btn:hover { background: #f3f4f6; color: #1f2937; }
.tab-btn.active {
  background: #f3f4f6;
  color: #111827;
}
.tab-btn.active svg { color: #111827; }
.tab-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  padding: 0 6px;
  height: 18px;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
}
.tab-btn.active .tab-pill {
  background: #111827;
  color: #ffffff;
}
.tab-bar-spacer { flex: 1; }
.tab-bar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-right: 6px;
}
.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: #ffffff;
  color: #374151;
  transition: all 0.15s ease-out;
  font-family: inherit;
  letter-spacing: 0.01em;
}
.header-btn:hover {
  border-color: #d1d5db;
  background: #f9fafb;
  color: #1f2937;
}
.header-btn-primary {
  background: #111827;
  color: #ffffff;
  border: 1px solid #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.header-btn-primary:hover {
  background: #1f2937 !important;
  border-color: #1f2937 !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(17, 24, 39, 0.20);
}
.header-btn-primary:active { transform: translateY(0); }
.task-filter-select {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  font-size: 12px;
  background: #ffffff;
  color: #1f2937;
  outline: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  transition: all 0.15s ease-out;
}
.task-filter-select:hover { border-color: #d1d5db; }
.task-filter-select:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.06); }

.task-search {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.task-search-icon {
  position: absolute;
  left: 9px;
  color: #9ca3af;
  pointer-events: none;
}
.task-search-input {
  padding: 6px 26px 6px 28px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  font-size: 12px;
  background: #ffffff;
  color: #1f2937;
  outline: none;
  font-family: inherit;
  font-weight: 600;
  width: 160px;
  transition: all 0.15s ease-out;
}
.task-search-input::placeholder { color: #9ca3af; font-weight: 500; }
.task-search-input:hover { border-color: #d1d5db; }
.task-search-input:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.06); width: 200px; }
.task-search-clear {
  position: absolute;
  right: 6px;
  width: 16px; height: 16px;
  border: none;
  background: #e5e7eb;
  color: #6b7280;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: inherit;
  transition: all 0.15s ease-out;
}
.task-search-clear:hover { background: #d1d5db; color: #1f2937; }

.tab-content {
  padding: 20px;
  background: #ffffff;
}
.task-calendar-tab {
  height: 620px; /* 固定高度：日历 tab 的 CalendarWidget 是 flex 布局（.cal-widget flex:1），需要父容器有确定高度才能铺满 */
  display: flex;
  flex-direction: column;
}
</style>
