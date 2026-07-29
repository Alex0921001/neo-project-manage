<template>
  <div class="detail-view">
    <!-- 主区：左侧详情卡 + 右侧 sticky 日历 -->
    <div class="detail-main">
      <div class="detail-left">
        <ProjectMeta :project="p" :set-label="currentSetLabel" @edit="showEditModal = true" @back="$emit('back')" @change-status="changeStatus" />
      </div>
      <div class="detail-right">
        <CalendarWidget :projects="[p]" />
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
          <select v-if="tab === 'tasks'" v-model="taskFilter" class="task-filter-select" @click.stop>
            <option value="all">全部任务</option>
            <option value="incomplete">仅未完成</option>
            <option value="done">仅已完成</option>
          </select>
          <button class="header-btn header-btn-primary" @click="onTabAction">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建
          </button>
        </div>
      </div>
      <div class="tab-content">
        <TaskTab
          v-show="tab === 'tasks'"
          ref="taskTabRef"
          :project-id="p.id"
          :tasks="filteredTasks"
          :files="p.files || []"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <FileTab
          v-show="tab === 'files'"
          ref="fileTabRef"
          :project-id="p.id"
          :files="p.files || []"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <NoteTab
          v-show="tab === 'notes'"
          ref="noteTabRef"
          :project-id="p.id"
          :notes="p.notes || []"
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
import { ref, computed, watch } from "vue";
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

// ===== 任务筛选 =====
const taskFilter = ref("all");
const filteredTasks = computed(() => {
  const all = p.value?.tasks || [];
  if (taskFilter.value === "incomplete") return all.filter(t => !t.done);
  if (taskFilter.value === "done") return all.filter(t => t.done);
  return all;
});

// ===== Load =====
async function loadProject() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}`);
  if (!res?.ok) { toast("项目不存在", "error"); emit("back"); return; }
  p.value = res.data;
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
  } else if (action === "delete-subtask") {
    res = await api(`api/projects/${props.projectId}/tasks/${payload.taskId}/subtasks/${payload.subId}`, { method: "DELETE" });
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
}
.detail-left { min-width: 0; display: flex; flex-direction: column; }
.detail-right { min-width: 0; min-height: 380px; display: flex; flex-direction: column; }

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
  overflow: hidden;
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
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-out;
  font-family: inherit;
  letter-spacing: 0.01em;
}
.header-btn-primary {
  background: #111827;
  color: #ffffff;
  border: 1px solid #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.header-btn-primary:hover {
  background: #1f2937;
  border-color: #1f2937;
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
  font-weight: 500;
  transition: all 0.15s ease-out;
}
.task-filter-select:hover { border-color: #d1d5db; }
.task-filter-select:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17,24,39,0.06); }

.tab-content {
  padding: 20px;
  background: #ffffff;
}
</style>
