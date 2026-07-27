<template>
  <div :class="['area-section', { 'mode-form': showAdd || editingId }]">
    <!-- Add mode -->
    <div v-if="showAdd" class="task-full-form">
      <h4 style="margin-bottom:12px">新建任务</h4>
      <input v-model="addName" type="text" placeholder="任务名称" class="task-inline-input">
      <textarea v-model="addDesc" rows="6" placeholder="任务描述（可选）" class="task-inline-textarea"></textarea>
      <div class="inline-actions">
        <button @click="showAdd = false">取消</button>
        <button class="btn-primary" @click="doAdd">添加</button>
      </div>
    </div>

    <!-- Edit mode -->
    <div v-else-if="editingId" class="task-full-form">
      <h4 style="margin-bottom:12px">编辑任务</h4>
      <input v-model="editName" type="text" placeholder="任务名称" class="task-inline-input">
      <textarea v-model="editDesc" rows="6" placeholder="任务描述（可选）" class="task-inline-textarea"></textarea>
      <div class="inline-actions">
        <button @click="editingId = null">取消</button>
        <button class="btn-primary" @click="doEdit(editingId)">保存</button>
      </div>
    </div>

    <!-- List mode -->
    <template v-else>
      <div v-if="!tasks.length" class="empty-state">暂无任务</div>
      <TaskCard
        v-for="t in tasks" :key="t.id"
        :task="t"
        @toggle-done="toggleDone"
        @edit="startEdit"
        @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
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

const showAdd = ref(false);
const addName = ref("");
const addDesc = ref("");
const editingId = ref(null);
const editName = ref("");
const editDesc = ref("");

function load() { emit("changed"); }

// ===== Add =====
async function doAdd() {
  if (!addName.value.trim()) return toast("请填写任务名称", "error");
  const res = await api(`api/projects/${props.projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify({ name: addName.value.trim(), description: addDesc.value.trim() }),
  });
  if (res.ok) { toast("已创建"); showAdd.value = false; addName.value = ""; addDesc.value = ""; load(); }
  else toast(res.error || "创建失败", "error");
}

// ===== Edit =====
function startEdit(t) {
  editingId.value = t.id;
  editName.value = t.name;
  editDesc.value = t.description || "";
}
async function doEdit(id) {
  if (!editName.value.trim()) return toast("请填写任务名称", "error");
  const res = await api(`api/projects/${props.projectId}/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: editName.value.trim(), description: editDesc.value.trim() }),
  });
  if (res.ok) { toast("已更新"); editingId.value = null; load(); }
  else toast(res.error || "更新失败", "error");
}

async function toggleDone(id, done) {
  await api(`api/projects/${props.projectId}/tasks/${id}`, { method: "PUT", body: JSON.stringify({ done }) });
  load();
}

defineExpose({ openAdd: () => { showAdd.value = true; } });
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
  font-size: 13px; background: #fff; color: var(--text); outline: none; margin-bottom: 10px;
}
.task-inline-input:focus { border-color: var(--accent); }
.task-inline-textarea {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; font-family: inherit; line-height: 1.6; resize: none;
  background: #fff; color: var(--text); outline: none;
  flex: 1; min-height: 0;
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
</style>
