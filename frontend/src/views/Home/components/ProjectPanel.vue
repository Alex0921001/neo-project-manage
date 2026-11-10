<template>
  <div class="proj-panel">
    <div class="panel-header">
      <div class="header-main">
        <h2>{{ currentSetLabel }}</h2>
        <div class="header-sub">{{ filteredProjects.length }} 个项目</div>
        <button class="header-gear" title="状态分组配置" @click="statusCfgShow = true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
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
      <div v-for="group in renderGroups" :key="group.name" class="proj-group">
        <div class="proj-group-header">
          <div class="group-title-row">
            <span :class="['group-dot', `dot-${group.key}`]"></span>
            <span class="proj-group-title">{{ group.label }}</span>
            <span class="proj-group-count">{{ group.items.length }}</span>
          </div>
        </div>
        <div class="project-grid">
          <ProjectCard
            v-for="p in group.visibleItems" :key="p.id"
            :project="p"
            :set-label="getSetName(p.projectSetId)"
            @open="$emit('open-project', p.id)"
            @edit="editProj"
            @delete="delProj"
            @archive="archiveProj"
            @unarchive="unarchiveProj"
            @toggle-pin="togglePin"
            @copy="copyProj"
            @update-desc="saveDesc"
          />
        </div>
        <div v-if="group.overflow > 0" class="group-more">
          <button class="group-more-btn" @click="openGroupAll(group)">
            查看全部{{ group.label }}项目（{{ group.items.length }} 条）
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </template>

    <ProjectFormModal
      :show="form.show"
      :mode="form.mode"
      :data="form.data"
      :default-set-id="filSetId === null ? '' : filSetId"
      :sets="sets"
      @close="form.show = false"
      @save="saveProject"
    />

    <!-- 分组「查看全部」弹窗：复用同列表弹窗，标题随分组变化；归档组额外提供恢复入口 -->
    <ArchivedProjectsModal
      :show="groupAllShow"
      :projects="groupAllItems"
      :sets="sets"
      :title="groupAllTitle"
      :show-restore="groupAllShowRestore"
      @close="groupAllShow = false"
      @open="onArchivedOpen"
      @restore="restoreFromModal"
    />

    <StatusGroupConfigModal
      :show="statusCfgShow"
      :config="statusConfig"
      @update:show="statusCfgShow = $event"
      @change="onStatusConfigChange"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { listProjects, createProject, updateProject, copyProject as copyProjectApi } from "../../../api/modules/project.js";
import { getStatusGroups, updateStatusGroups } from "../../../api/modules/statusGroup.js";
import { toast } from "../../../toast.js";
import { computeDisplayStatus } from "../../../utils/status.js";
import ProjectCard from "./ProjectCard.vue";
import ProjectFormModal from "./ProjectFormModal.vue";
import ArchivedProjectsModal from "./ArchivedProjectsModal.vue";
import StatusGroupConfigModal from "./StatusGroupConfigModal.vue";

const props = defineProps({
  sets: { type: Array, default: () => [] },
  refreshKey: { type: Number, default: 0 },
});
const emit = defineEmits(["open-project", "changed", "confirm-ask"]);

const search = ref("");
const projects = ref([]);
const filSetId = ref(null);
const loading = ref(true);

// ===== 状态分组配置（全局一份，改动即时生效 + 静默保存） =====
// 默认值兜底：配置未到达前首屏按默认顺序/显隐渲染，避免列表空白
const DEFAULT_STATUS_CONFIG = {
  order: ["预开始", "待开始", "进行中", "预结束", "已完成", "已取消", "已归档"],
  visible: { 预开始: true, 待开始: true, 进行中: true, 预结束: true, 已完成: true, 已取消: true, 已归档: false },
  limit: { 预开始: "all", 待开始: "all", 进行中: "all", 预结束: "all", 已完成: "all", 已取消: "all", 已归档: 5 },
};
const statusConfig = ref(DEFAULT_STATUS_CONFIG);
const statusCfgShow = ref(false);
const groupAllShow = ref(false);
const groupAllShowRestore = ref(false);
const groupAllItems = ref([]);
const groupAllTitle = ref("");

async function loadStatusConfig() {
  const res = await getStatusGroups({ _t: Date.now() });
  if (res && res.ok && res.data?.config) statusConfig.value = res.data.config;
}

/** 配置变更：先落本地（立即重绘），再静默写后台；失败重试一次，不弹提示 */
async function onStatusConfigChange(next) {
  statusConfig.value = next;
  const res = await updateStatusGroups(next);
  if (!res || !res.ok) await updateStatusGroups(next);
}

/** 打开某分组的「查看全部」弹窗（继承当前项目集与搜索条件，数据源即 group.items） */
function openGroupAll(group) {
  groupAllItems.value = group.items;
  groupAllTitle.value = `${group.label}项目`;
  groupAllShowRestore.value = group.name === ARCHIVED_GROUP;
  groupAllShow.value = true;
}

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
// 分组键固定 7 个（已延期不占键），顺序/显隐/数量由全局配置驱动
const GROUP_DEFS = [
  { name: "预开始", key: "pre-start", label: "预开始", statuses: ["预开始"] },
  { name: "待开始", key: "todo", label: "待开始", statuses: ["待开始", "已延期"] },
  { name: "进行中", key: "doing", label: "进行中", statuses: ["进行中"] },
  { name: "预结束", key: "pre-end", label: "预结束", statuses: ["预结束"] },
  { name: "已完成", key: "done", label: "已完成", statuses: ["已完成"] },
  { name: "已取消", key: "cancel", label: "已取消", statuses: ["已取消"] },
  { name: "已归档", key: "archived", label: "已归档", statuses: [] },
];
const ARCHIVED_GROUP = "已归档";

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
  const map = {};
  for (const def of GROUP_DEFS) {
    map[def.name] = def.name === ARCHIVED_GROUP ? archived : def.statuses.flatMap((s) => by(s));
  }
  return map;
});

// 按配置驱动渲染：顺序取 order，显隐取 visible，每组按 limit 截断
const renderGroups = computed(() => {
  const cfg = statusConfig.value;
  if (!cfg) return [];
  const out = [];
  for (const name of cfg.order) {
    if (!cfg.visible[name]) continue;
    const def = GROUP_DEFS.find((d) => d.name === name);
    if (!def) continue;
    const items = groupedProjects.value[name] || [];
    if (!items.length) continue;
    const limit = cfg.limit[name];
    const visibleItems = limit === "all" ? items : items.slice(0, limit);
    out.push({ ...def, items, visibleItems, overflow: items.length - visibleItems.length });
  }
  return out;
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
  const res = await listProjects({ projectSetId: sid || undefined, _t: Date.now() });
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

// 首次加载：先拉分组配置（无配置时回落到后端默认值，不阻塞列表）
loadStatusConfig();

watch(filSetId, load, { immediate: true });
watch(() => props.refreshKey, load);

function setFilter(id) {
  filSetId.value = id || null;
}

// ===== Project Form =====
const form = reactive({ show: false, id: "", data: null, mode: "create" });
function openAdd() { form.id = ""; form.data = null; form.mode = "create"; form.show = true; }
function editProj(p) { form.id = p.id; form.data = p; form.mode = "edit"; form.show = true; }
function copyProj(p) { form.id = ""; form.data = p; form.mode = "copy"; form.show = true; }

// 卡片内描述直接编辑：静默保存后刷新列表
async function saveDesc({ id, description }) {
  const res = await updateProject(id, { description }, { silent: true });
  if (res?.ok) {
    load();
    emit("changed");
  } else toast(res?.error || "描述保存失败", "error");
}
async function saveProject(d) {
  if (!d.name.trim()) return toast("请输入项目名称", "error");
  const body = { name: d.name, description: d.description, planStart: d.planStart, planEnd: d.planEnd, status: d.status, projectSetId: d.projectSetId, members: d.members };
  // 复制：以源项目为模板创建新项目，d.copy 为内容勾选
  if (form.mode === "copy" && form.data?.id) {
    const res = await copyProjectApi(form.data.id, { ...body, copy: d.copy }, { silent: true });
    if (res.ok) {
      const skipped = res.data?.skippedFiles || [];
      toast(skipped.length ? `已复制，${skipped.length} 个文件复制失败已跳过` : "已复制");
      form.show = false;
      load();
      emit("changed");
    } else toast(res.error || "复制失败", "error");
    return;
  }
  if (d.id) {
    const res = await updateProject(d.id, body, { silent: true });
    if (res.ok) { toast("已更新"); form.show = false; load(); emit("changed"); }
    else toast(res.error || "更新失败", "error");
  } else {
    const res = await createProject(body, { silent: true });
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
  const res = await updateProject(p.id, { archived: false }, { silent: true });
  if (res?.ok) { toast("已取消归档"); load(); emit("changed"); }
  else toast(res.error || "操作失败", "error");
}

// ===== 收藏 / 取消收藏 =====
// 点击只切换星星视觉 + 持久化，不触发排序重排（卡片不跳动）；置顶在下次数据刷新时生效
async function togglePin(p) {
  const next = !p.pinned;
  const prev = p.pinned;
  p.pinned = next; // 星星视觉即时反馈（排序不受影响，读 pinSnapshot）
  const res = await updateProject(p.id, { pinned: next }, { silent: true });
  if (res?.ok) {
    toast(next ? "已收藏置顶" : "已取消收藏");
  } else {
    p.pinned = prev; // 失败回滚
    toast(res.error || "操作失败", "error");
  }
}

// ===== 分组列表弹窗（「查看全部」） =====
async function restoreFromModal(p) {
  const res = await updateProject(p.id, { archived: false }, { silent: true });
  if (res?.ok) { toast("已恢复"); load(); emit("changed"); }
  else toast(res.error || "操作失败", "error");
}
// 点击项目名：关闭列表弹窗后跳转项目详情
function onArchivedOpen(id) {
  groupAllShow.value = false;
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
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px 16px;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}
.header-main { display: flex; align-items: baseline; gap: 10px; flex-shrink: 0; }
.header-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  align-self: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.header-gear:hover {
  color: var(--text);
  background: var(--bg-hover);
}
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
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* 常显搜索框 */
.header-search {
  position: relative;
  flex: 1 1 150px;
  min-width: 130px;
  max-width: 190px;
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
.dot-pre-start { background: var(--status-pre-start-text); }
.dot-doing { background: var(--status-doing-text); }
.dot-todo { background: var(--status-todo-text); }
.dot-pre-end { background: var(--status-pre-end-text); }
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

/* 已归档更多入口已并入统一的分组「查看全部」入口 */

/* 分组「查看全部」入口：超出配置数量时出现 */
.group-more {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
.group-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.group-more-btn:hover {
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
