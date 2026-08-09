<template>
  <div class="proj-panel">
    <div class="panel-header">
      <div class="header-main">
        <h2>{{ currentSetLabel }}</h2>
        <div class="header-sub">{{ filteredProjects.length }} 个项目</div>
      </div>
      <div class="header-actions">
        <button class="search-toggle" :class="{ active: showSearch }" @click="showSearch = !showSearch" title="搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        </button>
        <button class="btn-primary" @click="openAdd" title="新建项目">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建项目
        </button>
      </div>
    </div>

    <transition name="search">
      <div v-if="showSearch" class="search-area">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        <input v-model="search" class="search-input" placeholder="搜索项目名称...">
        <button v-if="search" class="search-clear" @click="search = ''" title="清空">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
        </button>
      </div>
    </transition>

    <div v-if="filteredProjects.length === 0 && !loading" class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M10 11h4"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>
      </div>
      <div class="empty-title">{{ search ? '没有匹配的项目' : '还没有项目' }}</div>
      <div class="empty-desc">{{ search ? '试试其他关键词' : '点击右上角"新建项目"开始' }}</div>
      <button v-if="!search" class="btn-primary" @click="openAdd">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建第一个项目
      </button>
    </div>

    <template v-else-if="filteredProjects.length">
      <div v-for="group in groupedProjects" :key="group.key" class="proj-group" v-show="group.items.length">
        <div class="proj-group-header">
          <div class="group-title-row">
            <span :class="['group-dot', `dot-${group.key}`]"></span>
            <span class="proj-group-title">{{ group.label }}</span>
          </div>
          <span class="proj-group-count">{{ group.items.length }}</span>
        </div>
        <div class="project-grid">
          <ProjectCard
            v-for="p in group.items" :key="p.id"
            :project="p"
            :set-label="getSetName(p.projectSetId)"
            @open="$emit('open-project', p.id)"
            @edit="editProj"
            @delete="delProj"
          />
        </div>
      </div>
    </template>

    <ProjectFormModal
      :show="form.show"
      :mode="form.id ? 'edit' : 'create'"
      :data="form.data"
      :default-set-id="filSetId === null ? '' : filSetId"
      :sets="sets"
      @close="form.show = false"
      @save="saveProject"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { computeDisplayStatus } from "../../../utils/status.js";
import ProjectCard from "./ProjectCard.vue";
import ProjectFormModal from "./ProjectFormModal.vue";

const props = defineProps({
  sets: { type: Array, default: () => [] },
  refreshKey: { type: Number, default: 0 },
});
const emit = defineEmits(["open-project", "changed", "confirm-ask"]);

const search = ref("");
const showSearch = ref(false);
const projects = ref([]);
const filSetId = ref(null);
const loading = ref(true);

const currentSetLabel = computed(() => {
  if (filSetId.value === null) return "全部项目";
  const s = props.sets.find(s => s.id === filSetId.value);
  return s ? s.name : "项目";
});

const filteredProjects = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return projects.value;
  return projects.value.filter((p) => (p.name || "").toLowerCase().includes(q));
});

// ===== 分组（基于展示状态：已延期合并到待开始组） =====
const groupedProjects = computed(() => {
  const list = filteredProjects.value;
  const by = (s) => list.filter(p => computeDisplayStatus(p) === s).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return [
    { key: "doing", label: "进行中", items: by("进行中") },
    { key: "todo", label: "待开始", items: [...by("待开始"), ...by("已延期")] },
    { key: "done", label: "已完成", items: by("已完成") },
  ];
});

function getSetName(projectSetId) {
  if (!projectSetId) return "";
  const set = props.sets.find((s) => s.id === projectSetId);
  return set ? set.name : "";
}

// ===== Load =====
let loadId = 0;
async function load() {
  const id = ++loadId;
  loading.value = true;
  const sid = filSetId.value;
  const q = sid !== null && sid !== undefined ? `?projectSetId=${encodeURIComponent(sid)}&_t=${Date.now()}` : `?_t=${Date.now()}`;
  const res = await api(`api/projects${q}`);
  if (id === loadId) {
    loading.value = false;
    if (res && res.ok) projects.value = res.data || [];
  }
}

watch(filSetId, load, { immediate: true });
watch(() => props.refreshKey, load);

function setFilter(id) {
  filSetId.value = id || null;
}

// ===== Project Form =====
const form = reactive({ show: false, id: "", data: null });
function openAdd() { form.id = ""; form.data = null; form.show = true; }
function editProj(p) { form.id = p.id; form.data = p; form.show = true; }
async function saveProject(d) {
  if (!d.name.trim()) return toast("请输入项目名称", "error");
  const body = { name: d.name, description: d.description, planStart: d.planStart, planEnd: d.planEnd, status: d.status, projectSetId: d.projectSetId, members: d.members };
  if (d.id) {
    const res = await api(`api/projects/${d.id}`, { method: "PUT", body: JSON.stringify(body) });
    if (res.ok) { toast("已更新"); form.show = false; load(); emit("changed"); }
    else toast(res.error || "更新失败", "error");
  } else {
    const res = await api("api/projects", { method: "POST", body: JSON.stringify(body) });
    if (res.ok) { toast("已创建"); form.show = false; load(); emit("changed"); }
    else toast(res.error || "创建失败", "error");
  }
}

function delProj(p) {
  const taskCount = p.taskCount ?? (p.tasks || []).length;
  const incompleteCount = p.incompleteTaskCount ?? taskCount;
  const doneCount = taskCount - incompleteCount;
  if (doneCount > 0) {
    toast(`项目「${p.name}」下还有 ${doneCount} 个已完成任务，无法删除`, "error");
    return;
  }
  const fileCount = p.fileCount ?? (p.files || []).length;
  const msgParts = [];
  if (incompleteCount > 0) msgParts.push(`${incompleteCount} 个未完成任务`);
  if (fileCount > 0) msgParts.push(`${fileCount} 个文件`);
  const summary = msgParts.length > 0 ? `（含 ${msgParts.join('、')}）` : '';
  emit("confirm-ask", { message: `确认删除项目「${p.name}」？${summary}`, action: "delete-project", payload: p.id });
}

defineExpose({ load, setFilter, filSetId });
</script>

<style scoped>
.proj-panel {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5) 28px;
  background: var(--bg);
  min-width: 0;
}

/* header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}
.header-main { display: flex; align-items: baseline; gap: 10px; }
.header-main h2 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text);
  margin: 0;
}
.header-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 按钮 */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  background: var(--text);
  color: #fff;
  border: 1px solid var(--text);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  box-shadow: var(--shadow-sm);
}
.btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  box-shadow: var(--shadow-md);
}

.search-toggle {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease-out;
}
.search-toggle:hover { background: #f3f4f6; color: #111827; }
.search-toggle.active { background: #f3f4f6; color: #111827; border-color: #d1d5db; }

/* search area */
.search-area {
  position: relative;
  margin-bottom: 14px;
  animation: searchIn 0.2s ease-out;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 9px 36px 9px 34px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  background: #ffffff;
  color: #1f2937;
  outline: none;
  transition: all 0.15s ease-out;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.search-input:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.06); }
.search-input::placeholder { color: #9ca3af; }
.search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px; height: 20px;
  border: none;
  background: #f3f4f6;
  border-radius: 50%;
  cursor: pointer;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.search-clear:hover { background: #e5e7eb; color: #1f2937; }

.search-enter-active, .search-leave-active { transition: all 0.2s ease-out; }
.search-enter-from { opacity: 0; transform: translateY(-4px); }
.search-leave-to { opacity: 0; transform: translateY(-4px); }

/* 分组 */
.proj-group {
  margin-bottom: 24px;
}
.proj-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.group-title-row { display: inline-flex; align-items: center; gap: 8px; }
.group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot-doing { background: var(--status-doing-text); }
.dot-todo { background: var(--status-todo-text); }
.dot-done { background: var(--status-done-text); }

.proj-group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.proj-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 1px 8px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

/* empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 80px 20px;
  color: #6b7280;
}
.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #f3f4f6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  margin-bottom: 16px;
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}
.empty-desc {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 16px;
}

@keyframes searchIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
