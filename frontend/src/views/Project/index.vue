<template>
  <div class="detail-view">
    <!-- 面包屑：返回 + 层级 -->
    <div class="detail-crumb">
      <button class="crumb-back" title="返回项目列表" @click="$emit('back')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="crumb-item crumb-root" @click="$emit('back')">全部项目</span>
      <template v-if="currentSetLabel">
        <span class="crumb-sep">/</span>
        <span class="crumb-item">{{ currentSetLabel }}</span>
      </template>
      <span class="crumb-sep">/</span>
      <span class="crumb-item crumb-current">{{ p?.name || '加载中...' }}</span>
    </div>

    <!-- 主区：详情卡（单列，无日历） -->
    <div class="detail-main">
      <ProjectMeta :project="p" :set-label="currentSetLabel" @edit="showEditModal = true" @back="$emit('back')" @delete="onDeleteProject" @change-status="changeStatus" @archive="onArchiveProject" @unarchive="onUnarchiveProject" />
    </div>

    <!-- 项目概览（V2.0 S13）：折叠面板，summary 数据随 loadProject 联动刷新 -->
    <ProjectOverview ref="overviewRef" :project-id="p?.id || ''" @jump-task="(taskId) => onTabCalendarSelectTask({ taskId })" />

    <!-- Tab 区 -->
    <section class="tab-section">
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          任务
        </button>
        <button class="tab-btn" :class="{ active: tab === 'calendar' }" @click="tab = 'calendar'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          日历
        </button>
        <button class="tab-btn" :class="{ active: tab === 'files' }" @click="tab = 'files'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          文件
        </button>
        <button class="tab-btn" :class="{ active: tab === 'notes' }" @click="tab = 'notes'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          备注
        </button>
        <button class="tab-btn" :class="{ active: tab === 'plans' }" @click="tab = 'plans'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
          方案
        </button>
        <button class="tab-btn" :class="{ active: tab === 'audit' }" @click="tab = 'audit'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          审计
        </button>
        <div class="tab-bar-spacer"></div>
        <div class="tab-bar-right">
          <div v-if="tab === 'tasks'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="taskSearch" class="task-search-input" placeholder="搜索任务" @click.stop />
            <button v-if="taskSearch" class="task-search-clear" title="清空" @click="taskSearch = ''">×</button>
          </div>
          <div v-if="tab === 'plans'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="planSearch" class="task-search-input" placeholder="搜索方案标题" @click.stop />
            <button v-if="planSearch" class="task-search-clear" title="清空" @click="planSearch = ''">×</button>
          </div>
          <el-select v-if="tab === 'plans'" v-model="planStatus" class="plan-status-select" size="small" @click.stop>
            <el-option v-for="s in PLAN_STATUS_FILTERS" :key="s" :label="s" :value="s" />
          </el-select>
          <!-- 审计筛选：行为下拉 + 时间范围（与任务/方案搜索对齐右上角） -->
          <el-select v-if="tab === 'audit'" v-model="auditAction" class="audit-filter-action" size="small" clearable placeholder="全部行为" @click.stop>
            <el-option v-for="a in auditActions" :key="a" :label="a" :value="a" />
          </el-select>
          <input v-if="tab === 'audit'" v-model="auditDateFrom" type="date" class="audit-filter-date" title="开始日期" @click.stop />
          <span v-if="tab === 'audit'" class="audit-filter-sep">至</span>
          <input v-if="tab === 'audit'" v-model="auditDateTo" type="date" class="audit-filter-date" title="结束日期" @click.stop />
          <button v-if="tab === 'audit' && hasAuditFilter" class="audit-filter-clear" @click="clearAuditFilters">清空</button>
          <button v-if="tab === 'tasks'" class="header-btn" @click="toggleExpandAll" title="展开或收起全部任务">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline v-if="expandAll" points="7 11 12 6 17 11"></polyline>
              <polyline v-if="expandAll" points="7 17 12 12 17 17"></polyline>
              <polyline v-if="!expandAll" points="7 13 12 18 17 13"></polyline>
              <polyline v-if="!expandAll" points="7 7 12 12 17 7"></polyline>
            </svg>
            {{ expandAll ? '收起' : '展开' }}
          </button>
          <button v-if="tab === 'plans'" class="header-btn" :disabled="compareCount < 2" :title="compareCount < 2 ? '勾选 2 个方案后对比' : '对比选中的 2 个方案'" @click="planTabRef?.openCompare()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            对比选中{{ compareCount > 0 ? `（${compareCount}/2）` : "" }}
          </button>
          <button v-if="tab !== 'calendar' && tab !== 'audit'" class="header-btn header-btn-primary" @click="onTabAction">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建
          </button>
        </div>
      </div>
      <div class="tab-content">
        <!-- 日历 tab：项目任务日历 -->
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
          v-if="tab === 'tasks'"
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
          v-if="tab === 'files'"
          ref="fileTabRef"
          :project-id="p?.id || ''"
          :files="p?.files || []"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <NoteTab
          v-if="tab === 'notes'"
          ref="noteTabRef"
          :project-id="p?.id || ''"
          :notes="p?.notes || []"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <AuditTab
          v-if="tab === 'audit'"
          ref="auditTabRef"
          :project-id="p?.id || ''"
          :project="p"
          :action-filter="auditAction"
          :date-from="auditDateFrom"
          :date-to="auditDateTo"
          @actions-ready="auditActions = $event"
        />
        <PlanTab
          v-if="tab === 'plans'"
          ref="planTabRef"
          :project-id="p?.id || ''"
          :search-query="planSearch"
          :status-query="planStatus"
          @changed="loadProject"
          @jump-task="onTabCalendarSelectTask"
          @compare-count="compareCount = $event"
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
      :confirm-text="confirm.confirmText"
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
import ProjectOverview from "./components/ProjectOverview.vue";
import TaskTab from "./components/TaskTab.vue";
import FileTab from "./components/FileTab.vue";
import NoteTab from "./components/NoteTab.vue";
import AuditTab from "./components/AuditTab.vue";
import PlanTab from "./components/PlanTab.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";
import ProjectFormModal from "../Home/components/ProjectFormModal.vue";
import CalendarWidget from "../../components/CalendarWidget.vue";

const props = defineProps({ projectId: String });
const emit = defineEmits(["back"]);

const p = ref(null);
const allSets = ref([]);
const taskTabRef = ref(null);
const fileTabRef = ref(null);
const noteTabRef = ref(null);
const auditTabRef = ref(null);
const planTabRef = ref(null);
const compareCount = ref(0);
const overviewRef = ref(null);

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
watch(tab, (v) => {
  try { localStorage.setItem(tabKey, v); } catch {}
  // 各 tab 均为 v-if 按需渲染：切回时组件重建，内部 watch(projectId, immediate) 自动拉取最新数据
});

// ===== 一键展开/收起 =====
// null = 未操作（子任务按默认：未完成展开、已完成折叠）；true/false = 显式展开/收起
const expandAll = ref(null);
function toggleExpandAll() {
  expandAll.value = !expandAll.value;
}

// ===== 任务筛选 =====
// 状态筛选在 index（全部/仅未完成/仅已完成）；关键词搜索过滤统一在 TaskTab 内完成（避免双份过滤逻辑）
const taskSearch = ref("");
const planSearch = ref("");
const PLAN_STATUS_FILTERS = ["全部", "草稿", "进行中", "已采纳", "已废弃", "已转任务"];
const planStatus = ref("全部");
// 审计筛选：行为 + 时间范围（tab 栏右上角）
const auditActions = ref([]);
const auditAction = ref("");
const auditDateFrom = ref("");
const auditDateTo = ref("");
const hasAuditFilter = computed(() => !!auditAction.value || !!auditDateFrom.value || !!auditDateTo.value);
function clearAuditFilters() {
  auditAction.value = "";
  auditDateFrom.value = "";
  auditDateTo.value = "";
}

const filteredTasks = computed(() => {
  return p.value?.tasks || [];
});

// ===== Load =====
async function loadProject() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}`);
  if (!res?.ok) { toast("项目不存在", "error"); emit("back"); return; }
  p.value = res.data;
  // S13：项目数据变化（任务/文件/批注变更）后联动刷新概览总结
  overviewRef.value?.refresh();
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
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ status }), silent: true });
  if (res.ok) { toast(`状态已切换为「${status}」`); loadProject(); }
  else toast(res.error || "状态切换失败", "error");  // 重复 toast 被 toast.js 内容去重
}

function onTabAction() {
  if (tab.value === 'tasks') taskTabRef.value?.openAdd();
  else if (tab.value === 'files') fileTabRef.value?.pickFile();
  else if (tab.value === 'notes') noteTabRef.value?.openAdd();
  else if (tab.value === 'plans') planTabRef.value?.openCreate();
}

// 日历 tab / 方案转任务点击任务：切回任务 tab 并滚动定位（兼容字符串 taskId 与 { taskId } 两种 payload）
function onTabCalendarSelectTask(payload) {
  const taskId = typeof payload === "string" ? payload : payload?.taskId;
  if (!taskId) return;
  tab.value = "tasks";
  nextTick(() => taskTabRef.value?.scrollToTaskById?.(taskId));
}

// ===== Archive / Unarchive（与首页右键归档同一数据调用：update_project 的 archived 参数） =====
function onArchiveProject() {
  if (!p.value) return;
  onConfirm({
    message: `确认归档项目「${p.value.name}」？归档后可在首页「已归档」分组查看，可随时恢复。`,
    confirmText: "确认归档",
    action: "archive-project",
    payload: p.value.id,
  });
}
async function onUnarchiveProject() {
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ archived: false }), silent: true });
  if (res.ok) { toast("已恢复归档"); loadProject(); }
  else toast(res.error || "操作失败", "error");
}

// ===== Delete Project =====
function onDeleteProject() {
  if (!p.value) return;
  const taskCount = p.value.taskCount ?? (p.value.tasks || []).length;
  const incompleteCount = p.value.incompleteTaskCount ?? taskCount;
  const doneCount = taskCount - incompleteCount;
  if (doneCount > 0) {
    toast(`项目「${p.value.name}」下还有 ${doneCount} 个已完成任务，无法删除`, "error");
    return;
  }
  const fileCount = p.value.fileCount ?? (p.value.files || []).length;
  const msgParts = [];
  if (incompleteCount > 0) msgParts.push(`${incompleteCount} 个未完成任务`);
  if (fileCount > 0) msgParts.push(`${fileCount} 个文件`);
  const summary = msgParts.length > 0 ? `（含 ${msgParts.join('、')}）` : '';
  onConfirm({ message: `确认删除项目「${p.value.name}」？${summary}`, action: "delete-project", payload: p.value.id });
}
async function doEditProject(d) {
  if (!d.name.trim()) return toast("请输入名称", "error");
  const members = d.members || [];
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ name: d.name.trim(), description: d.description.trim(), planStart: d.planStart, planEnd: d.planEnd, status: d.status, projectSetId: d.projectSetId, members }), silent: true });
  if (res.ok) { toast("已更新"); showEditModal.value = false; loadProject(); }
  else toast(res.error || "更新失败", "error");  // 重复 toast 被 toast.js 内容去重
}

// ===== Confirm =====
const confirm = ref({ show: false, message: "", action: "", payload: null, confirmText: "确认" });
function onConfirm(e) { confirm.value = { show: true, message: e.message, action: e.action, payload: e.payload, confirmText: e.confirmText || "确认" }; }
async function doConfirm() {
  const { action, payload } = confirm.value;
  confirm.value.show = false;
  let res;
  if (action === "delete-task") {
    res = await api(`api/projects/${props.projectId}/tasks/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "delete-file") {
    res = await api(`api/projects/${props.projectId}/files/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "delete-note") {
    res = await api(`api/projects/${props.projectId}/notes/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "delete-project") {
    res = await api(`api/projects/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "archive-project") {
    res = await api(`api/projects/${payload}`, { method: "PUT", body: JSON.stringify({ archived: true }), silent: true });
  }
  if (res?.ok) {
    if (action === "archive-project") toast("已归档");
    else toast("已删除");
    if (action === "delete-project") { emit("back"); return; }
    loadProject();
  }
  else if (res) toast(res.error || "删除失败", "error");  // 重复 toast 被 toast.js 内容去重
}
</script>

<style scoped>
.detail-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--bg);
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.detail-view::-webkit-scrollbar { display: none; }

/* ===== 面包屑 ===== */
.detail-crumb {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px 0;
}
.crumb-back {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  padding: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.crumb-back:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border);
}
.crumb-back svg { display: block; }
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

/* ===== 主区 ===== */
.detail-main {
  flex-shrink: 0;
  padding: 20px 24px;
  overflow: visible;
}

/* ===== Tab 区 ===== */
.tab-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  margin: 0 24px 24px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.tab-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
/* tab 风格对齐项目集 tabs：激活黑字加粗 + 淡灰背景 */
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  font-family: inherit;
  letter-spacing: 0.02em;
  margin: 6px 2px;
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
}
.tab-btn:hover { background: var(--bg-hover); color: var(--text); }
.tab-btn.active {
  background: var(--bg-hover);
  color: var(--text);
  font-weight: 700;
}
.tab-btn.active svg { color: var(--text); }
.tab-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 5px;
  height: 16px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
}
.tab-btn.active .tab-pill {
  background: var(--border);
  color: var(--text);
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
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg-card);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
  font-family: inherit;
  letter-spacing: 0.01em;
}
.header-btn:hover {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}
.header-btn-primary {
  background: var(--text);
  color: var(--bg-card);
  border: 1px solid var(--text);
  box-shadow: var(--shadow-sm);
}
.header-btn-primary:hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
  color: var(--bg-card) !important;
  box-shadow: var(--shadow-md);
}

.task-search {
  position: relative;
  display: inline-flex;
  align-items: center;
}
/* 方案状态筛选下拉（tab 栏，对比按钮左侧），高度与两侧按钮对齐（约 31px） */
.plan-status-select {
  width: 104px;
  flex-shrink: 0;
}
.plan-status-select :deep(.el-select__wrapper) {
  min-height: 31px;
  border-radius: var(--radius-sm);
}
/* 审计筛选（tab 栏右上角）：行为下拉 + 起止日期 */
.audit-filter-action {
  width: 130px;
  flex-shrink: 0;
}
.audit-filter-action :deep(.el-select__wrapper) {
  min-height: 31px;
  border-radius: var(--radius-sm);
}
.audit-filter-date {
  padding: 5px 8px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.audit-filter-date:focus {
  border-color: var(--border);
}
.audit-filter-sep {
  font-size: 12px;
  color: var(--text-tertiary);
}
.audit-filter-clear {
  padding: 5px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
}
.audit-filter-clear:hover {
  border-color: var(--border);
  color: var(--text);
}
.task-search-icon {
  position: absolute;
  left: 9px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.task-search-input {
  padding: 6px 26px 6px 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  font-family: inherit;
  font-weight: 600;
  width: 160px;
  transition: all var(--duration-fast) var(--ease-out);
}
.task-search-input::placeholder { color: var(--text-tertiary); font-weight: 500; }
.task-search-input:hover { border-color: var(--border); }
.task-search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--bg-hover); width: 200px; }
.task-search-clear {
  position: absolute;
  right: 6px;
  width: 16px; height: 16px;
  border: none;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
}
.task-search-clear:hover { background: var(--border); color: var(--text); }

.tab-content {
  padding: 20px;
  background: var(--bg-card);
  min-height: 300px;
}
.task-calendar-tab {
  height: 620px; /* 固定高度：日历 tab 的 CalendarWidget 是 flex 布局（.cal-widget flex:1），需要父容器有确定高度才能铺满 */
  display: flex;
  flex-direction: column;
}
</style>
