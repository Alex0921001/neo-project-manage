<template>
  <div :class="['area-section', { 'mode-form': inlineMode }]">
    <!-- 统一内联表单：新建 / 编辑 / 子任务 -->
    <div v-if="inlineMode" class="task-full-form">
      <h4 style="margin-bottom:12px">
        <template v-if="subtaskParent">
          子任务 · （父级任务：{{ subtaskParent.name }}）
        </template>
        <template v-else-if="editingId">编辑任务</template>
        <template v-else>新建任务</template>
      </h4>
      <input
        v-model="formName"
        type="text"
        placeholder="任务名称"
        class="task-inline-input"
        :class="{ err: submitErr && !formName.trim() }"
      >
      <p v-if="submitErr && !formName.trim()" class="field-err">请填写任务名称</p>
      <textarea
        v-model="formDesc"
        rows="6"
        placeholder="任务描述（可选）"
        class="task-inline-textarea"
      ></textarea>
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
      <TaskCard
        v-for="t in tasks" :key="t.id"
        :task="t"
        @toggle-done="toggleDone"
        @edit="startEdit"
        @subtask="startSubtask"
        @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
        @toggle-subtask="toggleSubtaskDone"
        @edit-subtask="startEditSubtask"
        @delete-subtask="deleteSubtask"
      />
    </template>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import TaskCard from "./TaskCard.vue";

const props = defineProps({
  projectId: String,
  tasks: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

// 统一内联表单状态
const inlineMode = ref(false);        // 是否正在显示内联表单
const editingId = ref(null);          // 非 null 表示编辑模式
const subtaskParent = ref(null);      // 非 null 表示子任务模式
const editingSubId = ref(null);       // 编辑子任务时记录 sub id
const formName = ref("");
const formDesc = ref("");
const submitErr = ref(false);

// ===== 打开方式 =====
function openAdd() {
  inlineMode.value = true;
  editingId.value = null;
  subtaskParent.value = null;
  editingSubId.value = null;
  formName.value = "";
  formDesc.value = "";
  submitErr.value = false;
}

function startEdit(t) {
  inlineMode.value = true;
  editingId.value = t.id;
  subtaskParent.value = null;
  editingSubId.value = null;
  formName.value = t.name;
  formDesc.value = t.description || "";
  submitErr.value = false;
}

function startSubtask(t) {
  inlineMode.value = true;
  editingId.value = null;
  subtaskParent.value = t;
  editingSubId.value = null;
  formName.value = "";
  formDesc.value = "";
  submitErr.value = false;
}

function startEditSubtask(task, sub) {
  inlineMode.value = true;
  editingId.value = null;
  subtaskParent.value = task;
  editingSubId.value = sub.id;
  formName.value = sub.name;
  formDesc.value = sub.description || "";
  submitErr.value = false;
}

function closeInline() {
  inlineMode.value = false;
}

// ===== 提交 =====
async function submitInline() {
  if (!formName.value.trim()) {
    submitErr.value = true;
    return;
  }
  const name = formName.value.trim();
  const description = formDesc.value.trim();

  if (editingSubId.value) {
    // 编辑子任务
    const res = await api(`api/projects/${props.projectId}/tasks/${subtaskParent.value.id}/subtasks/${editingSubId.value}`, {
      method: "PUT",
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) { toast("已更新"); closeInline(); load(); }
    else toast(res.error || "更新失败", "error");
  } else if (editingId.value) {
    // 编辑任务
    const res = await api(`api/projects/${props.projectId}/tasks/${editingId.value}`, {
      method: "PUT",
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) { toast("已更新"); closeInline(); load(); }
    else toast(res.error || "更新失败", "error");
  } else if (subtaskParent.value) {
    // 新建子任务
    const res = await api(`api/projects/${props.projectId}/tasks/${subtaskParent.value.id}/subtasks`, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) { toast("子任务已创建"); closeInline(); load(); }
    else toast(res.error || "创建失败", "error");
  } else {
    // 新建任务
    const res = await api(`api/projects/${props.projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) { toast("已创建"); closeInline(); load(); }
    else toast(res.error || "创建失败", "error");
  }
}

// ===== 其他操作 =====
function load() { emit("changed"); }

async function toggleDone(id, done) {
  await api(`api/projects/${props.projectId}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ done }) });
  load();
}

async function toggleSubtaskDone(taskId, subId, done) {
  await api(`api/projects/${props.projectId}/tasks/${taskId}/subtasks/${subId}`, {
    method: "PUT",
    body: JSON.stringify({ done }),
  });
  load();
}

async function deleteSubtask(taskId, subId) {
  emit("confirm-ask", {
    message: "确认删除此子任务？",
    action: "delete-subtask",
    payload: { taskId, subId }
  });
}

defineExpose({ openAdd });
</script>

<style scoped>
.area-section { margin-bottom: 24px; }
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
  flex: 1; min-height: 0; margin-top: 10px;
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
.field-err { margin: -8px 0 0; font-size: 12px; color: oklch(0.55 0.2 30); }
</style>
