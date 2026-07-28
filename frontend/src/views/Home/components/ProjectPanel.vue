<template>
  <div class="proj-panel">
    <div class="panel-header">
      <h2>项目</h2>
      <div class="header-actions">
        <button class="btn-icon" @click="showSearch = !showSearch" title="搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        </button>
        <button class="btn-icon" @click="openAdd">+</button>
      </div>
    </div>

    <div v-if="showSearch" class="search-area">
      <input v-model="search" class="search-input" placeholder="搜索项目名称...">
    </div>

    <div v-if="filteredProjects.length === 0" class="empty-state">暂无项目</div>
    <template v-else>
      <div v-for="group in groupedProjects" :key="group.key" class="proj-group">
        <div class="proj-group-header">
          <span class="proj-group-title">{{ group.label }}</span>
          <span class="proj-group-count">{{ group.items.length }}</span>
        </div>
        <div v-if="!group.items.length" class="proj-group-empty">—</div>
        <div v-else class="project-grid">
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

    <!-- Project Form Modal -->
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

const filteredProjects = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return projects.value;
  return projects.value.filter((p) => p.name.toLowerCase().includes(q));
});

// ===== 项目分组：进行中 / 待开始 / 已完成，组内按 updatedAt 倒序 =====
const groupedProjects = computed(() => {
  const list = filteredProjects.value;
  const byStatus = (s) => list.filter(p => p.status === s).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return [
    { key: "doing", label: "进行中", items: byStatus("进行中") },
    { key: "todo", label: "待开始", items: [...byStatus("待开始"), ...byStatus("已延期")] },
    { key: "done", label: "已完成", items: byStatus("已完成") },
  ];
});

function getSetName(projectSetId) {
  if (!projectSetId) return "未归类";
  const set = props.sets.find((s) => s.id === projectSetId);
  return set ? set.name : "未归类";
}

// ===== Load =====
let loadId = 0;
async function load() {
  const id = ++loadId;
  const sid = filSetId.value;
  const q = sid !== null && sid !== undefined ? `?projectSetId=${encodeURIComponent(sid)}&_t=${Date.now()}` : `?_t=${Date.now()}`;
  const res = await api(`api/projects${q}`);
  if (id === loadId && res && res.ok) projects.value = res.data || [];
}

watch(filSetId, load, { immediate: true });
watch(() => props.refreshKey, load);

// ===== Filter =====
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

// ===== Delete Project =====
function delProj(p) {
  const taskCount = p.taskCount ?? (p.tasks || []).length;
  const fileCount = p.fileCount ?? (p.files || []).length;
  const msgParts = [];
  if (taskCount > 0) msgParts.push(`${taskCount} 个任务`);
  if (fileCount > 0) msgParts.push(`${fileCount} 个文件`);
  if (msgParts.length > 0) { toast(`项目「${p.name}」下还有 ${msgParts.join('、')}，无法删除`, "error"); return; }
  emit("confirm-ask", { message: `确认删除项目「${p.name}」？`, action: "delete-project", payload: p.id });
}

defineExpose({ load, setFilter, filSetId });
</script>

<style scoped>
.proj-panel { flex: 1; overflow-y: auto; padding: 20px 16px; background: var(--bg-card); min-width: 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.panel-header h2 { font-size: 15px; font-weight: 600; }
.header-actions { display: flex; gap: 6px; }
.search-area { margin-bottom: 12px; }
.search-input {
  width: 100%; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 13px; background: var(--bg); color: var(--text);
  outline: none; transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-subtle); }
.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.proj-group { margin-bottom: 24px; }
.proj-group-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px; padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}
.proj-group-title {
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  letter-spacing: 0.02em; text-transform: uppercase;
}
.proj-group-count {
  display: inline-block;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 10px;
  line-height: 1.4;
}
.proj-group-empty {
  padding: 16px 4px;
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
}
</style>
