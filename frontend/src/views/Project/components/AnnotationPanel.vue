<template>
  <div class="annot-panel">
    <div class="annot-head">
      <span class="annot-title">便利贴</span>
      <span v-if="target" class="annot-target">{{ targetLabel }}</span>
    </div>

    <div v-if="!target" class="annot-empty">
      <span class="annot-empty-icon">📝</span>
      <p>点击任务或子任务的<br /><b>批注</b>按钮查看备注</p>
    </div>

    <div v-else class="annot-body">
      <div class="sticky-board">
        <template v-if="sortedAnnotations.length">
          <div
            v-for="a in sortedAnnotations"
            :key="a.id"
            :class="['sticky', { 'sticky-done': a.confirmed }]"
          >
            <p class="sticky-content">{{ a.content }}</p>
            <div class="sticky-foot">
              <span class="sticky-date">{{ formatDate(a.createdAt) }}</span>
              <div class="sticky-actions">
                <button
                  class="sticky-confirm"
                  :class="{ 'sticky-confirm-on': a.confirmed }"
                  :title="a.confirmed ? '取消确认' : '确认这条批注'"
                  @click="toggleConfirm(a)"
                >
                  <svg v-if="!a.confirmed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                </button>
                <button class="sticky-del" @click="remove(a)" title="删除">✕</button>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="sticky-empty">暂无批注，写一条吧 👇</div>
      </div>

      <div class="annot-compose">
        <textarea
          v-model="input"
          rows="2"
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
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  projectId: String,
  task: Object,
  subtask: Object,
  tasks: Array,
});
const emit = defineEmits(["changed"]);

const input = ref("");
const saving = ref(false);

const target = computed(() => props.subtask || props.task || null);
const targetLabel = computed(() => {
  if (props.subtask) {
    const parent = props.task;
    return parent ? `${parent.name} › ${props.subtask.name}` : props.subtask.name;
  }
  if (props.task) return props.task.name;
  return "";
});

const annotations = computed(() => {
  if (props.subtask) {
    const liveTask = props.tasks?.find(t => t.id === props.task?.id);
    const liveSub = liveTask?.subtasks?.find(s => s.id === props.subtask.id);
    return liveSub?.annotations || props.subtask.annotations || [];
  }
  if (props.task) {
    const live = props.tasks?.find(t => t.id === props.task.id);
    return live?.annotations || props.task.annotations || [];
  }
  return [];
});

// 未确认在前（按 createdAt 倒序），已确认在后（按 createdAt 倒序）
const sortedAnnotations = computed(() => {
  const list = annotations.value.map(a => ({
    ...a,
    confirmed: !!a.confirmed,
  }));
  const pending = list.filter(a => !a.confirmed);
  const done = list.filter(a => a.confirmed);
  const byTimeDesc = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  pending.sort(byTimeDesc);
  done.sort(byTimeDesc);
  return [...pending, ...done];
});

watch(target, () => { input.value = ""; });

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
  if (props.subtask) {
    return `api/projects/${props.projectId}/tasks/${props.task.id}/subtasks/${props.subtask.id}/annotations/${annId}`;
  }
  return `api/projects/${props.projectId}/tasks/${props.task.id}/annotations/${annId}`;
}

async function add() {
  const content = input.value.trim();
  if (!content || !props.task) return;
  saving.value = true;
  try {
    let url;
    if (props.subtask) {
      url = `api/projects/${props.projectId}/tasks/${props.task.id}/subtasks/${props.subtask.id}/annotations`;
    } else {
      url = `api/projects/${props.projectId}/tasks/${props.task.id}/annotations`;
    }
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

async function toggleConfirm(ann) {
  const res = await api(buildUrl(ann.id), {
    method: "PUT",
    body: JSON.stringify({ confirmed: !ann.confirmed }),
  });
  if (res?.ok) emit("changed");
  else toast(res.error || "操作失败", "error");
}
</script>

<style scoped>
.annot-panel {
  display: flex; flex-direction: column;
  height: 100%;
  min-height: 0;
  background: linear-gradient(135deg, oklch(0.97 0.02 90), oklch(0.96 0.02 80));
  border: 1px solid oklch(0.86 0.05 85);
  border-radius: var(--radius-md);
  padding: 14px;
  overflow: hidden;
  box-sizing: border-box;
}

.annot-head {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px dashed oklch(0.86 0.05 85);
  flex-shrink: 0;
}
.annot-title {
  font-size: 13px; font-weight: 700; color: oklch(0.45 0.10 80);
  letter-spacing: 0.04em;
}
.annot-target {
  font-size: 11px; color: oklch(0.55 0.08 70);
  background: oklch(0.95 0.05 85);
  padding: 2px 8px; border-radius: 10px;
  max-width: 60%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
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

/* 仅本区域滚动 */
.sticky-board {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding-right: 4px;
}
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
.sticky-done .sticky-content { color: oklch(0.30 0.06 145); }
.sticky-foot {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: oklch(0.50 0.06 75);
}
.sticky-done .sticky-foot { color: oklch(0.45 0.08 145); }
.sticky-actions { display: flex; gap: 4px; align-items: center; }
.sticky-confirm {
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid oklch(0.85 0.08 80);
  background: oklch(0.97 0.06 90);
  color: oklch(0.50 0.10 75);
  border-radius: 6px;
  cursor: pointer;
  transition: all 100ms var(--ease-out);
}
.sticky-confirm:hover { background: oklch(0.92 0.10 85); border-color: oklch(0.65 0.13 80); }
.sticky-confirm-on {
  background: oklch(0.72 0.13 145);
  color: #fff;
  border-color: oklch(0.65 0.13 145);
}
.sticky-confirm-on:hover { background: oklch(0.68 0.13 145); border-color: oklch(0.60 0.13 145); }
.sticky-del {
  border: none; background: transparent; cursor: pointer;
  color: oklch(0.55 0.10 75);
  width: 22px; height: 22px; border-radius: 4px;
  transition: all 100ms var(--ease-out);
  font-size: 12px;
}
.sticky-del:hover { background: oklch(0.88 0.10 30 / 0.4); color: oklch(0.45 0.18 30); }

/* 输入区：固定不滚 */
.annot-compose {
  border-top: 1px dashed oklch(0.86 0.05 85);
  padding-top: 10px;
  display: flex; flex-direction: column; gap: 6px;
  flex-shrink: 0;
}
.annot-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid oklch(0.86 0.05 85);
  border-radius: var(--radius-sm);
  font-size: 12px; line-height: 1.5;
  background: oklch(0.99 0.02 90);
  color: var(--text);
  outline: none; resize: none;
  font-family: inherit;
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
