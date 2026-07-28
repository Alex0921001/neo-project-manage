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
        <div class="file-refs-tags">
          <span v-for="fid in formFileRefs" :key="fid" class="file-tag">
            {{ fileMap[fid]?.name || fid }}
            <span class="file-tag-del" @click="removeFileRef(fid)">✕</span>
          </span>
        </div>
        <select class="file-refs-select" @change="addFileRef($event)">
          <option value="">+ 添加文件</option>
          <option v-for="f in availableFiles" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </div>

      <div class="inline-actions">
        <button @click="closeInline">取消</button>
        <button class="btn-primary" @click="submitInline">
          {{ editingId ? '保存' : '创建' }}
        </button>
      </div>
    </div>

    <!-- 列表模式 -->
    <template v-else>
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
            @toggle-done="toggleDone"
            @edit="startEdit"
            @subtask="startSubtask"
            @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
            @toggle-subtask="toggleSubtaskDone"
            @edit-subtask="startEditSubtask"
            @delete-subtask="deleteSubtask"
          />
        </div>
        <div v-if="doneTasks.length" class="task-group">
          <div class="task-group-header">
            <span class="task-group-title">已完成</span>
            <span class="task-group-count">{{ doneTasks.length }}</span>
          </div>
          <TaskCard
            v-for="t in doneTasks" :key="t.id"
            :task="t"
            :files="files"
            @toggle-done="toggleDone"
            @edit="startEdit"
            @subtask="startSubtask"
            @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
            @toggle-subtask="toggleSubtaskDone"
            @edit-subtask="startEditSubtask"
            @delete-subtask="deleteSubtask"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import TaskCard from "./TaskCard.vue";

const props = defineProps({
  projectId: String,
  tasks: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

// ===== 任务分组：未完成 / 已完成，组内按 createdAt 倒序 =====
const undoneTasks = computed(() =>
  props.tasks.filter(t => !t.done).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
);
const doneTasks = computed(() =>
  props.tasks.filter(t => t.done).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
);

// 内联表单状态
const inlineMode = ref(false);
const editingId = ref(null);
const subtaskParent = ref(null);
const editingSubId = ref(null);
const formName = ref("");
const formDesc = ref("");
const formFileRefs = ref([]);
const submitErr = ref(false);

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
}

function addFileRef(e) {
  const fid = e.target.value;
  if (fid && !formFileRefs.value.includes(fid)) formFileRefs.value.push(fid);
  e.target.value = "";
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

async function toggleDone(id, done) {
  await api(`api/projects/${props.projectId}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ done }) });
  load();
}

async function toggleSubtaskDone(taskId, subId, done) {
  await api(`api/projects/${props.projectId}/tasks/${taskId}/subtasks/${subId}`, { method: "PUT", body: JSON.stringify({ done }) });
  load();
}

async function deleteSubtask(taskId, subId) {
  emit("confirm-ask", { message: "确认删除此子任务？", action: "delete-subtask", payload: { taskId, subId } });
}

defineExpose({ openAdd });
</script>

<style scoped>
.area-section { margin-bottom: 24px; }
.task-group { margin-bottom: 20px; }
.task-group-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 0 2px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 6px;
}
.task-group-title {
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  letter-spacing: 0.02em; text-transform: uppercase;
}
.task-group-count {
  display: inline-block;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 10px;
  line-height: 1.4;
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
.file-refs-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.file-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border);
  font-size: 12px; color: var(--text); background: oklch(from var(--accent) l c h / 0.08);
}
.file-tag-del { cursor: pointer; font-size: 10px; color: var(--text-tertiary); line-height: 1; }
.file-tag-del:hover { color: oklch(0.5 0.18 30); }
.file-refs-select {
  padding: 4px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 12px; background: var(--bg-card); color: var(--text); outline: none;
  cursor: pointer; font-family: inherit;
}
.file-refs-select:focus { border-color: var(--accent); }
</style>
