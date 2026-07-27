<template>
  <div class="detail-view">
    <div class="detail-top-row">
      <div class="detail-card-area">
        <ProjectMeta :project="p" @edit="showEditModal = true" />
      </div>
      <div class="detail-sidebar" v-if="p">
        <CalendarWidget :projects="[p]" />
      </div>
    </div>

    <TabBar v-model="tab" :task-count="incompleteCount" :file-count="(p?.files || []).length" :note-count="(p?.notes || []).length">
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
      <template #action>
        <select v-if="tab === 'tasks'" v-model="taskFilter" class="task-filter-select" @click.stop>
          <option value="all">全部</option>
          <option value="incomplete">未完成</option>
          <option value="done">已完成</option>
        </select>
        <button class="btn-icon" @click="onTabAction" title="新建">+</button>
      </template>
    </TabBar>
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
import TabBar from "./components/TabBar.vue";
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
.detail-view { display: flex; flex-direction: column; padding: 24px 20px; overflow-y: auto; flex: 1; min-height: 0; }
.detail-top-row { display: flex; flex-direction: row; gap: 16px; margin-bottom: 12px; align-items: stretch; }
.detail-card-area { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.detail-sidebar { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; }
.task-filter-select {
  padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 12px; background: var(--bg-card); color: var(--text); outline: none;
  cursor: pointer; font-family: inherit; margin-right: 6px;
}
.task-filter-select:focus { border-color: var(--accent); }
</style>
