<template>
  <div class="proj-panel">
    <div class="panel-header">
      <div class="header-main">
        <h2>{{ currentSetLabel }}</h2>
        <div class="header-sub">{{ filteredProjects.length }} 个项目</div>
      </div>
      <div class="header-actions">
        <div class="header-search">
          <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
          <input v-model="search" class="search-input" placeholder="搜索项目名称...">
          <button v-if="search" class="search-clear" @click="search = ''" title="清空">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
          </button>
        </div>
        <button class="btn-primary" @click="openAdd" title="新建项目">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建项目
        </button>
        <button class="btn-calendar" @click="$emit('go-calendar')" title="前往日历">
          前往日历
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>

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
            <span class="proj-group-count">{{ group.items.length }}</span>
          </div>
        </div>
        <div class="project-grid">
          <ProjectCard
            v-for="p in visibleItems(group)" :key="p.id"
            :project="p"
            :set-label="getSetName(p.projectSetId)"
            @open="$emit('open-project', p.id)"
            @edit="editProj"
            @delete="delProj"
            @archive="archiveProj"
            @unarchive="unarchiveProj"
            @toggle-pin="togglePin"
          />
        </div>
        <!-- 已归档：更多按钮常驻（便于随时打开弹窗查看全部） -->
        <div v-if="group.key === 'archived' && group.items.length" class="archived-more">
          <button class="archived-more-btn" @click="archivedShow = true">
            查看全部已归档项目（{{ group.items.length }} 条）
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
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

    <ArchivedProjectsModal
      :show="archivedShow"
      :projects="archivedProjects"
      :sets="sets"
      @close="archivedShow = false"
      @open="onArchivedOpen"
      @restore="restoreFromModal"
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
import ArchivedProjectsModal from "./ArchivedProjectsModal.vue";

const props = defineProps({
  sets: { type: Array, default: () => [] },
  refreshKey: { type: Number, default: 0 },
});
const emit = defineEmits(["open-project", "changed", "confirm-ask"]);

const search = ref("");
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

// ===== 分组（基于展示状态：已延期合并到待开始组；已取消独立组；已归档独立组） =====
// 已归档组预览条数，超出走弹窗
const ARCHIVED_PREVIEW = 10;
// 排序依据快照（非响应式 Map，load 时填充）：点击收藏只变星星视觉，不触发排序重排（避免卡片跳动）
// 置顶排序在下次数据刷新（load）时体现
const pinSnapshot = new Map(); // id -> boolean
const groupedProjects = computed(() => {
  const list = filteredProjects.value;
  const by = (s) => list
    .filter(p => !p.archived && computeDisplayStatus(p) === s)
    .slice()
    .sort((a, b) => ((pinSnapshot.get(b.id) ? 1 : 0) - (pinSnapshot.get(a.id) ? 1 : 0)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const archived = list
    .filter(p => p.archived)
    .slice()
    .sort((a, b) => new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime());
  return [
    { key: "doing", label: "进行中", items: by("进行中") },
    { key: "todo", label: "待开始", items: [...by("待开始"), ...by("已延期")] },
    { key: "done", label: "已完成", items: by("已完成") },
    { key: "cancel", label: "已取消", items: by("已取消") },
    { key: "archived", label: "已归档", items: archived },
  ];
});

// 已归档组只预览前 N 条，其余走弹窗
function visibleItems(group) {
  return group.key === "archived" ? group.items.slice(0, ARCHIVED_PREVIEW) : group.items;
}

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
    if (res && res.ok) {
      projects.value = res.data || [];
      // 刷新排序快照（收藏置顶在下一次数据刷新时生效）
      pinSnapshot.clear();
      for (const p of projects.value) pinSnapshot.set(p.id, !!p.pinned);
    }
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
    const res = await api(`api/projects/${d.id}`, { method: "PUT", body: JSON.stringify(body), silent: true });
    if (res.ok) { toast("已更新"); form.show = false; load(); emit("changed"); }
    else toast(res.error || "更新失败", "error");
  } else {
    const res = await api("api/projects", { method: "POST", body: JSON.stringify(body), silent: true });
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

// ===== 归档 / 取消归档 =====
// 归档需二次确认（复用 confirm-ask 链路）；取消归档直接执行
function archiveProj(p) {
  emit("confirm-ask", {
    message: `确认归档项目「${p.name}」？归档后可在「已归档」分组查看，可随时恢复。`,
    confirmText: "确认归档",
    action: "archive-project",
    payload: p.id,
  });
}
async function unarchiveProj(p) {
  const res = await api(`api/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ archived: false }), silent: true });
  if (res?.ok) { toast("已取消归档"); load(); emit("changed"); }
  else toast(res.error || "操作失败", "error");
}

// ===== 收藏 / 取消收藏 =====
// 点击只切换星星视觉 + 持久化，不触发排序重排（卡片不跳动）；置顶在下次数据刷新时生效
async function togglePin(p) {
  const next = !p.pinned;
  const prev = p.pinned;
  p.pinned = next; // 星星视觉即时反馈（排序不受影响，读 pinSnapshot）
  const res = await api(`api/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ pinned: next }), silent: true });
  if (res?.ok) {
    toast(next ? "已收藏置顶" : "已取消收藏");
  } else {
    p.pinned = prev; // 失败回滚
    toast(res.error || "操作失败", "error");
  }
}

// ===== 已归档弹窗 =====
const archivedShow = ref(false);
const archivedProjects = computed(() => groupedProjects.value.find((g) => g.key === "archived")?.items || []);
async function restoreFromModal(p) {
  const res = await api(`api/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ archived: false }), silent: true });
  if (res?.ok) { toast("已恢复"); load(); emit("changed"); }
  else toast(res.error || "操作失败", "error");
}
// 点击项目名：关闭归档弹窗后跳转项目详情
function onArchivedOpen(id) {
  archivedShow.value = false;
  emit("open-project", id);
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

/* 常显搜索框 */
.header-search {
  position: relative;
  width: 190px;
}
.header-search .search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.header-search .search-input {
  width: 100%;
  padding: 7px 30px 7px 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.header-search .search-input:focus {
  border-color: var(--text);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.05);
}
.header-search .search-input::placeholder { color: var(--text-tertiary); }
.header-search .search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  border: none;
  background: var(--bg-hover);
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.header-search .search-clear:hover { background: var(--border); color: var(--text); }
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

/* 次级入口按钮（前往日历） */
.btn-calendar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-calendar:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--text-secondary);
}

/* 分组 */
.proj-group {
  margin-bottom: 24px;
}
.proj-group-header {
  display: flex;
  align-items: center;
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
.dot-cancel { background: var(--status-cancel-text); }
.dot-archived { background: var(--text-tertiary); }

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
  min-width: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 18px 16px;
}

/* 已归档更多入口 */
.archived-more {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
.archived-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.archived-more-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--text-secondary);
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
</style>
