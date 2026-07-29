<template>
  <!-- 任务卡：仅两种视觉状态
       - 默认（未完成）：暖色贴纸 + 阴影 + 左侧 4px 强调条（hover 显示）
       - 完成（task.done）：浅米色 + 绿色强调条 + 删除线 -->
  <div :class="['task-card', { 'task-card-done': task.done, 'task-card-locked': task.done }]">
    <div class="task-card-header" @click="expanded = !expanded" :data-connector-id="`task-${task.id}`">
      <button
        v-if="!task.done"
        class="status-btn status-btn-complete"
        title="点击设为完成"
        @click.stop="$emit('complete', task.id)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
      <button
        v-else
        class="status-btn status-btn-activate"
        title="点击重新激活（设为未完成）"
        @click.stop="$emit('activate', task.id)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
      </button>
      <span class="task-idx">#{{ task.index }}</span>
      <div class="task-card-title">
        <span :class="['task-name', { 'task-done': task.done }]">{{ task.name }}</span>
        <span
          v-if="annotCount > 0"
          class="annot-badge"
          :title="`查看 ${annotCount} 条批注`"
          @click.stop="$emit('select-annotation', { taskId: task.id })"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          {{ annotCount }}</span>
        <button
          v-if="!task.done && annotCount === 0"
          class="icon-btn"
          title="添加批注"
          @click.stop="$emit('select-annotation', { taskId: task.id })"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>
      <div class="task-card-actions">
        <button v-if="!task.done" class="icon-btn" title="编辑" @click.stop="$emit('edit', task)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button v-if="!task.done" class="icon-btn" title="添加子任务" @click.stop="$emit('subtask', task)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="icon-btn icon-btn-danger" @click.stop="$emit('delete', task.id)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>
    <div v-if="expanded" class="task-card-body">
      <p v-if="task.description" class="task-desc" v-html="formatDescription(task.description)"></p>
      <p v-else class="task-desc task-desc-empty">暂无描述</p>

      <div v-if="fileRefsList.length" class="file-refs-row">
        <span class="file-refs-row-label">关联文件</span>
        <span v-for="f in fileRefsList" :key="f.id" class="file-ref-link" @click="openFile(f)">{{ f.name }}</span>
      </div>

      <div v-if="task.subtasks && task.subtasks.length" class="subtask-list">
        <div v-for="s in task.subtasks" :key="s.id" class="subtask-item" :data-connector-id="`sub-${s.id}`">
          <button
            v-if="!s.done"
            class="status-btn status-btn-sm status-btn-complete"
            title="点击设为完成"
            @click.stop="$emit('complete-subtask', task.id, s.id)"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button
            v-else
            class="status-btn status-btn-sm status-btn-activate"
            title="点击重新激活"
            @click.stop="$emit('activate-subtask', task.id, s.id)"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          </button>
          <div class="subtask-content">
            <span :class="['subtask-name', { 'subtask-done': s.done }]">{{ s.name }}</span>
            <span v-if="s.description" class="subtask-desc" v-html="formatDescription(s.description)"></span>
            <div v-if="subFileRefs(s).length" class="subtask-file-refs">
              <span v-for="f in subFileRefs(s)" :key="f.id" class="file-ref-link file-ref-sm" @click.stop="openFile(f)">{{ f.name }}</span>
            </div>
          </div>
          <div class="subtask-actions">
            <span
              v-if="(s.annotations || []).length > 0"
              class="annot-badge annot-badge-sm"
              :title="`查看 ${(s.annotations || []).length} 条批注`"
              @click.stop="$emit('select-annotation', { taskId: task.id, subtaskId: s.id })"
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              {{ (s.annotations || []).length }}</span>
            <button
              v-if="!s.done && (s.annotations || []).length === 0"
              class="icon-btn icon-btn-sm"
              title="添加批注"
              @click.stop="$emit('select-annotation', { taskId: task.id, subtaskId: s.id })"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
            <button v-if="!s.done" class="icon-btn icon-btn-sm" title="编辑子任务" @click.stop="$emit('edit-subtask', task, s)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="icon-btn icon-btn-sm icon-btn-danger" @click.stop="$emit('delete-subtask', task.id, s.id)" title="删除子任务">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { api } from "../../../api.js";
import { formatDescription } from "../../../utils/text.js";

const props = defineProps({
  task: { type: Object, required: true },
  files: { type: Array, default: () => [] },
});
const emit = defineEmits([
  "complete",
  "activate",
  "complete-subtask",
  "activate-subtask",
  "edit",
  "subtask",
  "delete",
  "delete-subtask",
  "edit-subtask",
  "select-annotation",
]);

const expanded = ref(!props.task.done);
const annotCount = computed(() => (props.task.annotations || []).length);

// 文件引用
const fileRefsList = computed(() => {
  const ids = props.task.fileRefs || [];
  return ids.map((id) => props.files.find((f) => f.id === id)).filter(Boolean);
});

function subFileRefs(sub) {
  const ids = sub.fileRefs || [];
  return ids.map((id) => props.files.find((f) => f.id === id)).filter(Boolean);
}

async function openFile(f) {
  if (!f?.path) return;
  await api(`api/open-file?path=${encodeURIComponent(f.path)}`);
}
</script>

<style scoped>
/* ===== 任务卡：贴纸质感、暖色调 ===== */
.task-card {
  position: relative;
  background: oklch(0.995 0.01 85);
  border: 1px solid oklch(0.88 0.04 85);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 2px oklch(0.5 0.04 80 / 0.06), 0 2px 6px oklch(0.5 0.04 80 / 0.04);
  transition: all var(--duration-fast) var(--ease-out);
  overflow: hidden;
}
.task-card::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: oklch(0.72 0.13 80);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.task-card:hover {
  border-color: oklch(0.82 0.06 80);
  box-shadow: 0 1px 3px oklch(0.5 0.05 80 / 0.10), 0 6px 14px oklch(0.5 0.04 80 / 0.08);
  transform: translateY(-1px);
}
.task-card:hover::before { opacity: 1; }

/* 完成态：浅绿底 + 虚线 + 绿色强调条 */
.task-card-done {
  background: oklch(0.95 0.06 145);
  border-color: oklch(0.82 0.08 145);
}
.task-card-done::before {
  background: oklch(0.65 0.16 145);
  opacity: 0.85;
}
.task-card-locked {
  border-style: dashed;
  border-color: oklch(0.78 0.10 145);
}
.task-card-done:hover {
  border-color: oklch(0.72 0.12 145);
  box-shadow: 0 1px 3px oklch(0.45 0.10 145 / 0.15), 0 6px 14px oklch(0.45 0.08 145 / 0.10);
}

/* header */
.task-card-header {
  display: grid;
  grid-template-columns: auto 24px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 14px;
  cursor: pointer;
  user-select: none;
}

/* 状态按钮：✓ 完成 / ↻ 激活 */
.status-btn {
  width: 22px;
  height: 22px;
  border: 1.5px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.status-btn svg { display: block; }
.status-btn-sm { width: 18px; height: 18px; font-size: 10px; }
.status-btn-complete {
  background: oklch(0.99 0.01 85);
  color: oklch(0.55 0.04 80);
  border-color: oklch(0.78 0.04 85);
}
.status-btn-complete:hover {
  background: oklch(0.94 0.08 145);
  color: oklch(0.45 0.13 145);
  border-color: oklch(0.65 0.13 145);
  transform: scale(1.08);
}
.status-btn-activate {
  background: oklch(0.65 0.16 145);
  color: #fff;
  border-color: oklch(0.55 0.16 145);
  box-shadow: 0 1px 3px oklch(0.50 0.14 145 / 0.35);
}
.status-btn-activate:hover {
  background: oklch(0.58 0.16 145);
  border-color: oklch(0.48 0.16 145);
  box-shadow: 0 2px 6px oklch(0.50 0.14 145 / 0.45);
  transform: scale(1.08);
}

/* ===== 统一图标按钮样式（SVG icons）===== */
.icon-btn {
  width: 22px;
  height: 22px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: oklch(0.45 0.08 80);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.icon-btn svg { display: block; }
.icon-btn-sm { width: 20px; height: 20px; border-radius: 4px; }
.icon-btn-sm svg { width: 12px; height: 12px; }
.icon-btn:hover {
  background: oklch(0.94 0.06 85);
  color: oklch(0.35 0.10 80);
  border-color: oklch(0.85 0.08 85);
}
.icon-btn-danger:hover {
  background: oklch(0.93 0.10 30 / 0.45);
  color: oklch(0.45 0.18 30);
  border-color: oklch(0.72 0.10 30);
}

/* 序号 */
.task-idx {
  color: oklch(0.55 0.04 75);
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  text-align: right;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* 任务名 */
.task-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.task-name {
  font-size: 15px;
  font-weight: 500;
  color: oklch(0.30 0.04 80);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.task-done {
  text-decoration: line-through;
  text-decoration-color: oklch(0.60 0.06 80);
  text-decoration-thickness: 1.5px;
  color: oklch(0.55 0.04 80);
}

/* actions 区：默认显示 */
.task-card-actions {
  display: flex;
  gap: 2px;
  opacity: 1;
}

/* body */
.task-card-body {
  padding: 0 12px 10px calc(12px + 22px + 8px + 24px + 8px);
  animation: slideDown 0.2s ease-out;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 描述 */
.task-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: oklch(0.40 0.04 80);
  line-height: 1.6;
  padding: 8px 10px;
  background: oklch(0.97 0.02 85);
  border-left: 3px solid oklch(0.85 0.06 85);
  border-radius: 0 4px 4px 0;
}
.task-desc-empty {
  color: var(--text-tertiary);
  font-style: italic;
  background: transparent;
  border-left-color: oklch(0.90 0.02 85);
}

/* 完成态：卡片内子元素统一绿调 */
.task-card-done .task-desc {
  background: oklch(0.92 0.05 145);
  color: oklch(0.35 0.08 145);
  border-left-color: oklch(0.75 0.12 145);
}
.task-card-done .task-desc-empty {
  background: transparent;
  border-left-color: oklch(0.85 0.08 145);
  color: oklch(0.50 0.06 145);
}

/* 批注徽标 - 暖色胶囊 */
.annot-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px;
  border-radius: 10px;
  background: oklch(0.93 0.10 85);
  color: oklch(0.35 0.12 75);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid oklch(0.85 0.08 80);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  white-space: nowrap;
  box-shadow: 0 1px 2px oklch(0.5 0.06 80 / 0.10);
}
.annot-badge:hover {
  background: oklch(0.90 0.12 85);
  border-color: oklch(0.65 0.13 80);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px oklch(0.5 0.06 80 / 0.15);
}
.annot-badge-sm {
  font-size: 10px;
  padding: 1px 6px;
}
.task-card-done .annot-badge {
  background: oklch(0.92 0.08 145);
  color: oklch(0.30 0.12 145);
  border-color: oklch(0.82 0.10 145);
}
.task-card-done .annot-badge:hover {
  background: oklch(0.88 0.10 145);
  border-color: oklch(0.68 0.14 145);
}

/* 关联文件 */
.file-refs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  align-items: center;
}
.file-refs-row-label {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-right: 4px;
}
.file-ref-link {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: oklch(0.94 0.04 75);
  color: oklch(0.40 0.06 75);
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid oklch(0.88 0.04 75);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.file-ref-link:hover {
  background: oklch(0.91 0.06 75);
  color: oklch(0.35 0.10 75);
  border-color: oklch(0.78 0.06 75);
}
.file-ref-sm { font-size: 11px; padding: 1px 6px; }
.task-card-done .file-ref-link {
  background: oklch(0.93 0.04 145);
  color: oklch(0.35 0.10 145);
  border-color: oklch(0.85 0.06 145);
}
.task-card-done .file-ref-link:hover {
  background: oklch(0.90 0.06 145);
  color: oklch(0.30 0.12 145);
  border-color: oklch(0.75 0.10 145);
}

/* 子任务列表 */
.subtask-list {
  border-top: 1px dashed oklch(0.85 0.05 85);
  padding-top: 8px;
  margin-top: 8px;
}
.task-card-done .subtask-list {
  border-top-color: oklch(0.82 0.08 145);
}
.subtask-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 4px;
  transition: background var(--duration-fast) var(--ease-out);
}
.subtask-item:hover { background: oklch(0.97 0.03 85); }
.task-card-done .subtask-item:hover { background: oklch(0.92 0.05 145); }

.subtask-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.subtask-name {
  font-size: 13px;
  color: oklch(0.35 0.04 80);
  display: block;
  word-break: break-word;
}
.task-card-done .subtask-name { color: oklch(0.30 0.06 145); }
.subtask-desc {
  font-size: 12px;
  color: oklch(0.50 0.04 75);
  margin-top: 1px;
  display: block;
}
.task-card-done .subtask-desc { color: oklch(0.40 0.06 145); }
.subtask-done {
  text-decoration: line-through;
  color: oklch(0.55 0.04 80);
  text-decoration-thickness: 1.5px;
}
.task-card-done .subtask-done { color: oklch(0.45 0.08 145); }
.subtask-file-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.subtask-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
</style>