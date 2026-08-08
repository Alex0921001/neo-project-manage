<template>
  <div class="annot-panel">
    <div class="annot-head">
      <div class="annot-head-left">
        <span class="annot-title">便利贴</span>
        <span v-if="target" class="annot-target">{{ targetLabel }}</span>
      </div>
      <button class="annot-close" title="关闭便利贴面板" @click="emit('close')">✕</button>
    </div>

    <div v-if="!target" class="annot-empty">
      <span class="annot-empty-icon">📝</span>
      <p>点击任务或子任务的<br /><b>批注</b>按钮查看备注</p>
    </div>

    <div v-else class="annot-body">
      <!-- 便利贴列表：仅展示每一条便利贴，完成态不再有确认按钮 -->
      <div class="sticky-board">
        <template v-if="sortedAnnotations.length">
          <div
            v-for="a in sortedAnnotations"
            :key="a.id"
            :class="['sticky', { 'sticky-done': a.confirmed, 'sticky-editing': editingAnnId === a.id }]"
          >
            <template v-if="editingAnnId === a.id">
              <textarea
                v-model="editingContent"
                rows="4"
                class="sticky-edit-input"
                @keydown.meta.enter="saveEdit"
                @keydown.ctrl.enter="saveEdit"
                @keydown.escape="cancelEdit"
              ></textarea>
            </template>
            <template v-else>
              <p class="sticky-content" v-html="formatDescription(a.content)"></p>
            </template>
            <div class="sticky-foot">
              <span class="sticky-date">{{ formatDate(a.createdAt) }}</span>
              <div class="sticky-actions">
                <template v-if="editingAnnId === a.id">
                  <button class="sticky-cancel" title="取消" @click="cancelEdit">取消</button>
                  <button class="sticky-save" :disabled="!editingContent.trim() || editingSaving" @click="saveEdit">
                    {{ editingSaving ? "保存中…" : "保存" }}
                  </button>
                </template>
                <template v-else>
                  <button v-if="!a.confirmed" class="sticky-icon-btn" title="编辑" @click="startEdit(a)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    v-if="!targetDone"
                    class="sticky-icon-btn"
                    :title="a.confirmed ? '取消确认' : '确认这条批注'"
                    @click="toggleConfirm(a)"
                  >
                    <svg v-if="!a.confirmed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                  </button>
                  <button v-if="!a.confirmed" class="sticky-icon-btn sticky-del" @click="askRemove(a)" title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </template>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="sticky-empty">
          {{ targetDone ? '该任务没有批注' : '暂无批注，写一条吧 👇' }}
        </div>
      </div>

      <!-- 输入区：仅未完成态显示 -->
      <div v-if="!targetDone" class="annot-compose">
        <textarea
          v-model="input"
          rows="4"
          placeholder="写一条批注（例：前端已完成，待后端对接）"
          class="annot-input"
          @keydown.meta.enter="add"
          @keydown.ctrl.enter="add"
        ></textarea>
        <div class="annot-actions">
          <span class="annot-hint">⌘/Ctrl + Enter 提交</span>
          <button class="btn-primary annot-btn" :disabled="!input.trim() || saving" @click="add">
            {{ saving ? "保存中…" : "贴上" }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="confirmDel.show"
      :message="`确定要删除这条批注吗？\n\n“${confirmDel.ann?.content?.slice(0, 60) || ''}${(confirmDel.ann?.content || '').length > 60 ? '…' : ''}”`"
      @close="cancelRemove"
      @confirm="doRemove"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import ConfirmModal from "../../../components/ConfirmModal.vue";
import { formatDescription } from "../../../utils/text.js";

const props = defineProps({
  projectId: String,
  task: Object,           // 任意层级的任务对象（顶层/子/孙都走这一条）
  tasks: Array,            // 项目下所有任务（用于取最新数据）
});
const emit = defineEmits(["changed", "close"]);

const input = ref("");
const saving = ref(false);

// 编辑状态
const editingAnnId = ref("");
const editingContent = ref("");
const editingSaving = ref(false);

// 删除二次确认
const confirmDel = ref({ show: false, ann: null });

// 层级提示（仅为显示，不影响逻辑）
const targetDepth = computed(() => {
  if (!props.task) return 0;
  return props.task.parent_task_id ? 2 : 1;  // 1=顶层，2=子/孙
});

// 模板 v-if="target" / v-if="!target" 依赖此变量（fe94971 重构时曾误删，导致面板永远显示空状态）
const target = computed(() => props.task || null);

const targetLabel = computed(() => props.task?.name || "");
const targetDone = computed(() => !!props.task?.done);

const annotations = computed(() => {
  if (!props.task) return [];
  // 树形结构里：递归找到任意层级的 task（含子孙）拿它的 annotations
  function findAnns(tasks, id) {
    for (const t of tasks) {
      if (t.id === id) return t.annotations || [];
      if (t.subtasks?.length) {
        const sub = findAnns(t.subtasks, id);
        if (sub) return sub;
      }
    }
    return null;
  }
  const live = props.tasks ? findAnns(props.tasks, props.task.id) : null;
  return live || props.task.annotations || [];
});

// 排序：未确认在前（按 createdAt 倒序），已确认在后（按 createdAt 倒序）
const sortedAnnotations = computed(() => {
  const list = annotations.value.map(a => ({ ...a, confirmed: !!a.confirmed }));
  const pending = list.filter(a => !a.confirmed);
  const done = list.filter(a => a.confirmed);
  const byTimeDesc = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  pending.sort(byTimeDesc);
  done.sort(byTimeDesc);
  return [...pending, ...done];
});

watch(() => props.task?.id, () => { input.value = ""; });

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, "0");
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildUrl(annId) {
  return `api/projects/${props.projectId}/tasks/${props.task.id}/annotations/${annId}`;
}

async function add() {
  const content = input.value.trim();
  if (!content || !props.task) return;
  saving.value = true;
  try {
    const url = `api/projects/${props.projectId}/tasks/${props.task.id}/annotations`;
    const res = await api(url, { method: "POST", body: JSON.stringify({ content }) });
    if (res?.ok) {
      input.value = "";
      emit("changed");
    } else {
      toast(res.error || "保存失败", "error");
    }
  } finally {
    saving.value = false;
  }
}

async function remove(ann) {
  const res = await api(buildUrl(ann.id), { method: "DELETE" });
  if (res?.ok) emit("changed");
  else toast(res.error || "删除失败", "error");
}

function askRemove(ann) {
  confirmDel.value = { show: true, ann };
}
function cancelRemove() {
  confirmDel.value = { show: false, ann: null };
}
async function doRemove() {
  const ann = confirmDel.value.ann;
  confirmDel.value = { show: false, ann: null };
  if (!ann) return;
  await remove(ann);
}

async function toggleConfirm(ann) {
  const res = await api(buildUrl(ann.id), {
    method: "PUT",
    body: JSON.stringify({ confirmed: !ann.confirmed }),
  });
  if (res?.ok) emit("changed");
  else toast(res.error || "操作失败", "error");
}

function startEdit(ann) {
  editingAnnId.value = ann.id;
  editingContent.value = ann.content;
}
function cancelEdit() {
  editingAnnId.value = "";
  editingContent.value = "";
}
async function saveEdit() {
  const content = editingContent.value.trim();
  if (!content) return toast("批注内容不能为空", "error");
  editingSaving.value = true;
  try {
    const res = await api(buildUrl(editingAnnId.value), {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    if (res?.ok) {
      toast("已更新");
      cancelEdit();
      emit("changed");
    } else {
      toast(res.error || "更新失败", "error");
    }
  } finally {
    editingSaving.value = false;
  }
}
</script>

<style scoped>
.annot-panel {
  display: flex; flex-direction: column;
  flex-shrink: 0;
  min-height: 200px;
  max-height: 560px;
  background: linear-gradient(135deg, oklch(0.97 0.02 90), oklch(0.96 0.02 80));
  border: 1px solid oklch(0.86 0.05 85);
  border-radius: var(--radius-md);
  padding: 14px;
  overflow: hidden;
  box-sizing: border-box;
}

.annot-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px dashed oklch(0.86 0.05 85);
  flex-shrink: 0;
  gap: 8px;
}
.annot-head-left {
  display: flex; align-items: baseline; gap: 8px;
  min-width: 0; flex: 1;
}
.annot-title {
  font-size: 13px; font-weight: 700; color: oklch(0.45 0.10 80);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.annot-target {
  font-size: 11px; color: oklch(0.55 0.08 70);
  background: oklch(0.95 0.05 85);
  padding: 2px 8px; border-radius: 10px;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.annot-close {
  width: 24px; height: 24px;
  border: 1px solid oklch(0.86 0.05 85);
  background: oklch(0.99 0.02 90);
  color: oklch(0.55 0.08 70);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 100ms var(--ease-out);
}
.annot-close:hover {
  background: oklch(0.93 0.05 30 / 0.4);
  color: oklch(0.45 0.18 30);
  border-color: oklch(0.65 0.13 30);
}

.annot-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--text-tertiary); font-size: 12px; text-align: center;
  gap: 6px;
}
.annot-empty-icon { font-size: 24px; opacity: 0.45; }
.annot-empty b { color: oklch(0.55 0.10 80); }

.annot-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }

/* 便利贴列表：完成态只展示便利贴，未完成态便利贴在 sticky-board 上半部分 */
.sticky-board {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding-right: 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sticky-board::-webkit-scrollbar { display: none; }
.sticky-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: oklch(0.55 0.08 70); padding: 24px 0;
}

/* 便利贴：黄色方块 + 阴影，已确认用绿色 */
.sticky {
  padding: 10px 12px;
  background: oklch(0.95 0.10 90);
  box-shadow: 0 1px 3px oklch(0.5 0.05 80 / 0.18), 0 4px 10px oklch(0.5 0.05 80 / 0.08);
  border-radius: 4px;
  word-break: break-word;
  transition: background 120ms var(--ease-out);
}
.sticky-done {
  background: oklch(0.93 0.10 145);
}
.sticky-content {
  margin: 0 0 8px; font-size: 13px; line-height: 1.55;
  color: oklch(0.30 0.05 80);
}
.sticky-content :deep(img) { max-width: 250px; max-height: 150px; height: auto; width: auto; border-radius: 6px; cursor: zoom-in; object-fit: contain; }
.sticky-done .sticky-content { color: oklch(0.30 0.06 145); }
.sticky-foot {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: oklch(0.50 0.06 75);
}
.sticky-done .sticky-foot { color: oklch(0.45 0.08 145); }
.sticky-actions { display: flex; gap: 4px; align-items: center; }

/* 统一图标按钮：无边框，仅 hover 变色 */
.sticky-icon-btn {
  width: 26px; height: 26px;
  border: none;
  background: transparent;
  color: oklch(0.55 0.08 75);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 100ms var(--ease-out);
}
.sticky-icon-btn:hover {
  background: oklch(0.92 0.06 85);
  color: oklch(0.35 0.10 75);
}

/* 编辑态：便利贴高亮 + 输入框 */
.sticky.sticky-editing {
  background: oklch(0.96 0.08 85);
  border: 1px dashed oklch(0.65 0.13 80);
  box-shadow: 0 0 0 3px oklch(0.65 0.13 80 / 0.10);
}
.sticky-edit-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid oklch(0.65 0.13 80);
  border-radius: var(--radius-sm);
  font-size: 13px; line-height: 1.55;
  background: #fff;
  color: var(--text);
  outline: none;
  resize: vertical;
  font-family: inherit;
  margin-bottom: 8px;
  min-height: 80px;
}
.sticky-edit-input:focus {
  border-color: oklch(0.55 0.13 75);
  box-shadow: 0 0 0 3px oklch(0.65 0.13 80 / 0.15);
}

/* 保存 / 取消按钮 */
.sticky-save,
.sticky-cancel {
  height: 24px;
  padding: 0 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 100ms var(--ease-out);
  border: 1px solid transparent;
}
.sticky-cancel {
  background: transparent;
  border-color: oklch(0.85 0.06 80);
  color: oklch(0.50 0.08 75);
}
.sticky-cancel:hover { background: oklch(0.96 0.04 85); border-color: oklch(0.75 0.08 80); color: oklch(0.35 0.10 75); }
.sticky-save {
  background: oklch(0.72 0.13 80);
  color: #fff;
  border-color: oklch(0.65 0.13 80);
}
.sticky-save:hover:not(:disabled) { background: oklch(0.68 0.13 80); border-color: oklch(0.60 0.13 80); }
.sticky-save:disabled { opacity: 0.5; cursor: not-allowed; }

/* 输入区：仅未完成态显示 */
.annot-compose {
  border-top: 1px dashed oklch(0.86 0.05 85);
  padding-top: 10px;
  display: flex; flex-direction: column; gap: 6px;
  flex-shrink: 0;
}
.annot-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid oklch(0.86 0.05 85);
  border-radius: var(--radius-sm);
  font-size: 13px; line-height: 1.55;
  background: oklch(0.99 0.02 90);
  color: var(--text);
  outline: none; resize: vertical;
  font-family: inherit;
  min-height: 90px;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.annot-input:focus { border-color: oklch(0.65 0.13 80); }
.annot-actions {
  display: flex; justify-content: space-between; align-items: center;
}
.annot-hint { font-size: 11px; color: var(--text-tertiary); }
.annot-btn {
  padding: 5px 16px; border-radius: var(--radius-sm);
  background: oklch(0.72 0.13 80); color: #fff;
  border: 1px solid oklch(0.65 0.13 80);
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: all 100ms var(--ease-out);
}
.annot-btn:hover:not(:disabled) {
  background: oklch(0.68 0.13 80); border-color: oklch(0.60 0.13 80);
}
.annot-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>