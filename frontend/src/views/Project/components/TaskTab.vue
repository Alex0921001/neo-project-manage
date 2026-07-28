<template>
  <div :class="['area-section', { 'mode-form': inlineMode }]">
    <!-- 统一内联表单 -->
    <div v-if="inlineMode" class="task-full-form">
      <h4 style="margin-bottom:12px">
        <template v-if="subtaskParent">
          子任务 · （父级任务：{{ subtaskParent.name }}）
        </template>
        <template v-else-if="editingId">编辑任务</template>
        <template v-else>新建任务</template>
      </h4>
      <textarea
        v-model="formName"
        rows="3"
        placeholder="任务名称"
        class="task-inline-input task-name-area"
        :class="{ err: submitErr && !formName.trim() }"
      ></textarea>
      <p v-if="submitErr && !formName.trim()" class="field-err">请填写任务名称</p>
      <textarea
        v-model="formDesc"
        rows="6"
        placeholder="任务描述（可选）"
        class="task-inline-textarea"
      ></textarea>

      <!-- 关联文件 -->
      <div v-if="files && files.length" class="file-refs-area">
        <label class="file-refs-label">关联文件</label>
        <div v-if="formFileRefs.length" class="file-refs-tags">
          <span v-for="fid in formFileRefs" :key="fid" class="file-tag">
            <svg class="file-tag-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="file-tag-name">{{ fileMap[fid]?.name || fid }}</span>
            <span class="file-tag-del" @click="removeFileRef(fid)">✕</span>
          </span>
        </div>
        <div v-else class="file-refs-empty">暂未关联文件</div>
        <div class="file-add-dropdown" ref="fileDropdownRef">
          <button type="button" class="file-add-trigger" @click="fileDropdownOpen = !fileDropdownOpen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>添加关联文件</span>
            <svg class="file-add-caret" :class="{ open: fileDropdownOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div v-if="fileDropdownOpen" class="file-add-menu">
            <div v-if="!availableFiles.length" class="file-add-empty">暂无可添加的文件</div>
            <button
              v-for="f in availableFiles"
              :key="f.id"
              type="button"
              class="file-add-item"
              @mousedown.prevent="addFileRef(f.id)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="file-add-item-name">{{ f.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="inline-actions">
        <button @click="closeInline">取消</button>
        <button class="btn-primary" @click="submitInline">
          {{ editingId ? '保存' : '创建' }}
        </button>
      </div>
    </div>

    <!-- 列表模式：左侧任务列表 + 右侧便利贴 -->
    <div v-else class="task-tab-layout">
      <div class="task-tab-list">
        <div v-if="!tasks.length" class="empty-state">暂无任务</div>
        <template v-else>
          <div v-if="undoneTasks.length" class="task-group">
            <div class="task-group-header">
              <span class="task-group-title">未完成</span>
              <span class="task-group-count">{{ undoneTasks.length }}</span>
            </div>
            <TaskCard
              v-for="t in undoneTasks" :key="t.id"
              :task="t"
              :files="files"
              @complete="completeTask"
              @activate="activateTask"
              @complete-subtask="completeSubtask"
              @activate-subtask="activateSubtask"
              @edit="startEdit"
              @subtask="startSubtask"
              @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
              @edit-subtask="startEditSubtask"
              @delete-subtask="deleteSubtask"
              @select-annotation="onSelectAnnotation"
            />
          </div>
          <div v-if="doneTasks.length" class="task-group task-group-done">
            <div class="task-group-header">
              <span class="task-group-title">已完成</span>
              <span class="task-group-count">{{ doneTasks.length }}</span>
            </div>
            <TaskCard
              v-for="t in doneTasks" :key="t.id"
              :task="t"
              :files="files"
              @complete="completeTask"
              @activate="activateTask"
              @complete-subtask="completeSubtask"
              @activate-subtask="activateSubtask"
              @edit="startEdit"
              @subtask="startSubtask"
              @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
              @edit-subtask="startEditSubtask"
              @delete-subtask="deleteSubtask"
              @select-annotation="onSelectAnnotation"
            />
          </div>
        </template>
      </div>
      <aside v-if="activeTaskId" class="task-tab-annot">
        <AnnotationPanel
          :project-id="projectId"
          :task="activeTask"
          :subtask="activeSubtask"
          :tasks="tasks"
          @changed="() => emit('changed')"
          @close="closeAnnotation"
        />
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import TaskCard from "./TaskCard.vue";
import AnnotationPanel from "./AnnotationPanel.vue";

const props = defineProps({
  projectId: String,
  tasks: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

// ===== 当前选中的批注目标 =====
const activeTaskId = ref("");
const activeSubtaskId = ref("");
const activeTask = computed(() => props.tasks.find(t => t.id === activeTaskId.value) || null);
const activeSubtask = computed(() => {
  if (!activeTask.value || !activeSubtaskId.value) return null;
  return (activeTask.value.subtasks || []).find(s => s.id === activeSubtaskId.value) || null;
});

function onSelectAnnotation({ taskId, subtaskId }) {
  // 📌 / 📝 点击只展开便利贴面板，不负责关闭
  activeTaskId.value = taskId;
  activeSubtaskId.value = subtaskId || "";
}
function closeAnnotation() {
  activeTaskId.value = "";
  activeSubtaskId.value = "";
}

// ===== 任务分组：未完成 / 已完成，组内按 createdAt 倒序 =====
function sortByCreatedDesc(arr) {
  return arr
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ta = a.t.createdAt ? new Date(a.t.createdAt).getTime() : 0;
      const tb = b.t.createdAt ? new Date(b.t.createdAt).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return b.i - a.i; // 旧数据无 createdAt 时，按数组索引倒序（新 push 的在末尾）
    })
    .map(x => x.t);
}
const undoneTasks = computed(() => sortByCreatedDesc(props.tasks.filter(t => !t.done)));
const doneTasks = computed(() => sortByCreatedDesc(props.tasks.filter(t => t.done)));

// 内联表单状态
const inlineMode = ref(false);
const editingId = ref(null);
const subtaskParent = ref(null);
const editingSubId = ref(null);
const formName = ref("");
const formDesc = ref("");
const formFileRefs = ref([]);
const submitErr = ref(false);

// 文件下拉开关
const fileDropdownOpen = ref(false);
const fileDropdownRef = ref(null);
function onDocMouseDown(e) {
  if (fileDropdownOpen.value && fileDropdownRef.value && !fileDropdownRef.value.contains(e.target)) {
    fileDropdownOpen.value = false;
  }
}
onMounted(() => document.addEventListener("mousedown", onDocMouseDown));
onUnmounted(() => document.removeEventListener("mousedown", onDocMouseDown));

// 文件查找 & 可添加列表
const fileMap = computed(() => {
  const m = {};
  for (const f of props.files) m[f.id] = f;
  return m;
});
const availableFiles = computed(() =>
  props.files.filter(f => !formFileRefs.value.includes(f.id))
);

// ===== 打开方式 =====
function resetForm() {
  formName.value = "";
  formDesc.value = "";
  formFileRefs.value = [];
  submitErr.value = false;
  fileDropdownOpen.value = false;
}

function openAdd() {
  inlineMode.value = true;
  editingId.value = null;
  subtaskParent.value = null;
  editingSubId.value = null;
  resetForm();
}

function startEdit(t) {
  inlineMode.value = true;
  editingId.value = t.id;
  subtaskParent.value = null;
  editingSubId.value = null;
  formName.value = t.name;
  formDesc.value = t.description || "";
  formFileRefs.value = [...(t.fileRefs || [])];
  submitErr.value = false;
}

function startSubtask(t) {
  inlineMode.value = true;
  editingId.value = null;
  subtaskParent.value = t;
  editingSubId.value = null;
  resetForm();
}

function startEditSubtask(task, sub) {
  inlineMode.value = true;
  editingId.value = null;
  subtaskParent.value = task;
  editingSubId.value = sub.id;
  formName.value = sub.name;
  formDesc.value = sub.description || "";
  formFileRefs.value = [...(sub.fileRefs || [])];
  submitErr.value = false;
}

function closeInline() {
  inlineMode.value = false;
  fileDropdownOpen.value = false;
}

function addFileRef(fid) {
  if (fid && !formFileRefs.value.includes(fid)) {
    formFileRefs.value.push(fid);
    fileDropdownOpen.value = false; // 选中后自动关闭下拉
  }
}
function removeFileRef(fid) {
  const idx = formFileRefs.value.indexOf(fid);
  if (idx !== -1) formFileRefs.value.splice(idx, 1);
}

// ===== 提交 =====
function buildPayload() {
  return {
    name: formName.value.trim(),
    description: formDesc.value.trim(),
    fileRefs: formFileRefs.value,
  };
}

async function submitInline() {
  if (!formName.value.trim()) { submitErr.value = true; return; }
  const payload = buildPayload();

  if (editingSubId.value) {
    const res = await api(`api/projects/${props.projectId}/tasks/${subtaskParent.value.id}/subtasks/${editingSubId.value}`, {
      method: "PUT", body: JSON.stringify(payload),
    });
    if (res.ok) { toast("已更新"); closeInline(); load(); }
    else toast(res.error || "更新失败", "error");
  } else if (editingId.value) {
    const res = await api(`api/projects/${props.projectId}/tasks/${editingId.value}`, {
      method: "PUT", body: JSON.stringify(payload),
    });
    if (res.ok) { toast("已更新"); closeInline(); load(); }
    else toast(res.error || "更新失败", "error");
  } else if (subtaskParent.value) {
    const res = await api(`api/projects/${props.projectId}/tasks/${subtaskParent.value.id}/subtasks`, {
      method: "POST", body: JSON.stringify(payload),
    });
    if (res.ok) { toast("子任务已创建"); closeInline(); load(); }
    else toast(res.error || "创建失败", "error");
  } else {
    const res = await api(`api/projects/${props.projectId}/tasks`, {
      method: "POST", body: JSON.stringify(payload),
    });
    if (res.ok) { toast("已创建"); closeInline(); load(); }
    else toast(res.error || "创建失败", "error");
  }
}

function load() { emit("changed"); }

// ===== 完成（带校验）=====
async function completeTask(id) {
  const task = props.tasks.find(t => t.id === id);
  if (!task) return;
  const issues = [];
  const pendingSubs = (task.subtasks || []).filter(s => !s.done);
  if (pendingSubs.length) issues.push(`${pendingSubs.length} 个子任务未完成`);
  const pendingAnns = (task.annotations || []).filter(a => !a.confirmed);
  if (pendingAnns.length) issues.push(`${pendingAnns.length} 条批注未确认`);
  if (issues.length) {
    toast(`无法完成任务：${issues.join("、")}`, "error");
    return;
  }
  await api(`api/projects/${props.projectId}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ done: true }) });
  load();
}

// ===== 激活（不校验，直接设为未完成）=====
async function activateTask(id) {
  await api(`api/projects/${props.projectId}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ done: false }) });
  load();
}

async function completeSubtask(taskId, subId) {
  const task = props.tasks.find(t => t.id === taskId);
  const sub = task?.subtasks?.find(s => s.id === subId);
  if (!sub) return;
  const pendingAnns = (sub.annotations || []).filter(a => !a.confirmed);
  if (pendingAnns.length) {
    toast(`无法完成子任务：${pendingAnns.length} 条批注未确认`, "error");
    return;
  }
  await api(`api/projects/${props.projectId}/tasks/${taskId}/subtasks/${subId}`, { method: "PUT", body: JSON.stringify({ done: true }) });
  load();
}

async function activateSubtask(taskId, subId) {
  await api(`api/projects/${props.projectId}/tasks/${taskId}/subtasks/${subId}`, { method: "PUT", body: JSON.stringify({ done: false }) });
  load();
}

async function deleteSubtask(taskId, subId) {
  emit("confirm-ask", { message: "确认删除此子任务？", action: "delete-subtask", payload: { taskId, subId } });
}

defineExpose({ openAdd });
</script>

<style scoped>
.area-section {
  display: flex; flex-direction: column;
  flex: 1; min-height: 0;
  margin-bottom: 24px;
}
.task-tab-layout {
  display: flex; gap: 16px; align-items: stretch;
  flex: 1; min-height: 0;
}
.task-tab-list {
  flex: 1; min-width: 0; min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.task-tab-annot {
  width: 320px; flex-shrink: 0;
  display: flex; flex-direction: column;
  min-height: 480px;
  height: 100%;
  align-self: stretch;
  overflow: hidden;
}
.task-group {
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-group > :deep(.task-card) { margin-bottom: 0; }
.task-group-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 0 2px 6px;
  border-bottom: 1px dashed oklch(0.86 0.05 85);
}
.task-group-title {
  font-size: 11px; font-weight: 700; color: oklch(0.45 0.08 75);
  letter-spacing: 0.06em; text-transform: uppercase;
}
.task-group-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px;
  background: oklch(0.93 0.08 85);
  color: oklch(0.40 0.12 75);
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 8px;
  line-height: 1.3;
}

/* 已完成分组：绿调 */
.task-group.task-group-done .task-group-header {
  border-bottom-color: oklch(0.82 0.10 145);
}
.task-group.task-group-done .task-group-title {
  color: oklch(0.40 0.14 145);
}
.task-group.task-group-done .task-group-count {
  background: oklch(0.90 0.12 145);
  color: oklch(0.28 0.14 145);
}
.area-section.mode-form { height: 100%; display: flex; flex-direction: column; margin-bottom: 0; }
.task-full-form {
  padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--bg-card);
  flex: 1; display: flex; flex-direction: column;
}
.task-inline-input {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; background: #fff; color: var(--text); outline: none;
}
.task-inline-input:focus { border-color: var(--accent); }
.task-inline-textarea {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; font-family: inherit; line-height: 1.6; resize: none;
  background: #fff; color: var(--text); outline: none;
  flex: 1; min-height: 0; margin-top: 10px; word-break: break-word;
}
.task-inline-textarea:focus { border-color: var(--accent); }
.inline-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.inline-actions button {
  padding: 6px 16px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); cursor: pointer;
  font-size: 12px; font-weight: 500;
  transition: all 150ms var(--ease-out);
}
.inline-actions button:not(.btn-primary):hover { background: var(--bg-hover); }
.inline-actions .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.inline-actions .btn-primary:hover { background: var(--accent-hover); }
.err { border-color: oklch(0.55 0.2 30); }
.task-name-area { resize: none; margin-bottom: 10px; word-break: break-word; }
.field-err { margin: -8px 0 0; font-size: 12px; color: oklch(0.55 0.2 30); }
.file-refs-area { margin-top: 10px; }
.file-refs-label { display: block; font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.file-refs-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.file-refs-empty {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}
.file-tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 4px 3px 8px; border-radius: 12px; border: 1px solid var(--border);
  font-size: 12px; color: var(--text); background: oklch(from var(--accent) l c h / 0.08);
  max-width: 100%; min-width: 0;
}
.file-tag-icon { color: var(--text-tertiary); flex-shrink: 0; }
.file-tag-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.file-tag-del {
  cursor: pointer; font-size: 11px; color: var(--text-tertiary); line-height: 1;
  width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; flex-shrink: 0; transition: all 0.15s;
}
.file-tag-del:hover { color: #dc2626; background: rgba(220, 38, 38, 0.1); }

/* 自定义文件下拉 */
.file-add-dropdown { position: relative; }
.file-add-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.file-add-trigger:hover {
  border-color: #9ca3af;
  background: #f9fafb;
  color: #374151;
}
.file-add-trigger:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.file-add-trigger > span { flex: 1; font-weight: 500; }
.file-add-caret {
  color: #9ca3af;
  transition: transform 0.18s ease-out;
  flex-shrink: 0;
}
.file-add-caret.open { transform: rotate(180deg); }

.file-add-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  padding: 4px;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  animation: file-menu-slide-up 0.16s ease-out;
  transform-origin: bottom center;
}
@keyframes file-menu-slide-up {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.file-add-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 5px;
  font-size: 13px;
  color: #1f2937;
  font-family: inherit;
  transition: background 0.12s;
}
.file-add-item:hover, .file-add-item:focus {
  background: #eff6ff;
  color: #1e40af;
  outline: none;
}
.file-add-item svg { color: #9ca3af; flex-shrink: 0; }
.file-add-item:hover svg { color: var(--accent); }
.file-add-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.file-add-empty {
  padding: 10px 12px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  font-style: italic;
}
</style>
