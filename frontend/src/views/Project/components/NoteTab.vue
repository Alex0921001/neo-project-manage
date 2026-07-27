<template>
  <div :class="['area-section', { 'mode-form': showAdd || editingId }]">
    <!-- Add mode -->
    <div v-if="showAdd" class="note-full-form">
      <h4 style="margin-bottom:12px">新建备注</h4>
      <textarea v-model="addContent" rows="6" placeholder="输入备注内容..."></textarea>
      <div class="inline-actions">
        <button @click="showAdd = false">取消</button>
        <button class="btn-primary" @click="doAdd">添加</button>
      </div>
    </div>

    <!-- Edit mode -->
    <div v-else-if="editingId" class="note-full-form">
      <h4 style="margin-bottom:12px">编辑备注</h4>
      <textarea v-model="editContent" rows="6"></textarea>
      <div class="inline-actions">
        <button @click="editingId = null">取消</button>
        <button class="btn-primary" @click="doEditNote">保存</button>
      </div>
    </div>

    <!-- List mode -->
    <template v-else>
      <div v-if="!notes.length" class="empty-state">暂无备注</div>
      <div v-for="n in notes.slice().reverse()" :key="n.id" class="note-card">
        <p class="note-content">{{ n.content }}</p>
        <div class="note-bottom">
          <span class="note-date">{{ n.createdAt }}</span>
          <div class="note-actions">
            <button class="btn-icon-sm" @click="startEditNote(n)" title="编辑">✎</button>
            <button class="btn-icon-sm btn-icon-sm-danger" @click="$emit('confirm-ask', { message: '确认删除此备注？', action: 'delete-note', payload: n.id })" title="删除">✕</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  projectId: String,
  notes: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

const showAdd = ref(false);
const addContent = ref("");
const editingId = ref(null);
const editContent = ref("");

function load() { emit("changed"); }

function startAdd() { showAdd.value = true; addContent.value = ""; }
async function doAdd() {
  if (!addContent.value.trim()) return toast("请输入备注内容", "error");
  const res = await api(`api/projects/${props.projectId}/notes`, {
    method: "POST", body: JSON.stringify({ content: addContent.value.trim() }),
  });
  if (res.ok) { toast("已添加"); showAdd.value = false; addContent.value = ""; load(); }
  else toast(res.error || "添加失败", "error");
}

function startEditNote(n) { editingId.value = n.id; editContent.value = n.content; }
async function doEditNote() {
  if (!editContent.value.trim()) return toast("备注内容不能为空", "error");
  const res = await api(`api/projects/${props.projectId}/notes/${editingId.value}`, {
    method: "PUT", body: JSON.stringify({ content: editContent.value.trim() }),
  });
  if (res.ok) { toast("已更新"); editingId.value = null; load(); }
  else toast(res.error || "更新失败", "error");
}

defineExpose({ openAdd: startAdd });
</script>

<style scoped>
.area-section { margin-bottom: 24px; }
.area-section.mode-form { height: 100%; display: flex; flex-direction: column; margin-bottom: 0; }
.note-full-form {
  padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--bg-card);
  flex: 1; display: flex; flex-direction: column;
}
.note-full-form textarea {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 13px; font-family: inherit; line-height: 1.6; resize: none;
  background: #fff; color: var(--text); outline: none;
  flex: 1; min-height: 0;
}
.note-full-form textarea:focus { border-color: var(--accent); }
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
.note-card {
  border: 1px solid var(--border-light); border-radius: var(--radius-md);
  background: var(--bg-card); padding: 12px 14px; margin-bottom: 8px;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.note-card:hover { border-color: var(--border); }
.note-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.note-date { font-size: 12px; color: var(--text-tertiary); }
.note-actions { display: flex; gap: 2px; opacity: 0; transition: opacity var(--duration-fast) var(--ease-out); }
.note-card:hover .note-actions { opacity: 1; }
.note-content { margin: 0; font-size: 13px; line-height: 1.6; color: var(--text); white-space: pre-wrap; }
.btn-icon-sm {
  width: 24px; height: 24px; border: none; border-radius: 4px; background: transparent;
  cursor: pointer; font-size: 14px; line-height: 1; display: inline-flex;
  align-items: center; justify-content: center; color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-icon-sm:hover { background: var(--bg-hover); color: var(--text); }
.btn-icon-sm-danger:hover { background: oklch(0.93 0.05 30 / 0.3); color: oklch(0.5 0.18 30); }
</style>
