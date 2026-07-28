<template>
  <!-- 任务卡：仅两种视觉状态
       - 默认（未完成）：正常显示
       - 完成（task.done）：删除线 + 灰背景 + dashed 边框 -->
  <div :class="['task-card', { 'task-card-done': task.done, 'task-card-locked': task.done }]">
    <div class="task-card-header" @click="expanded = !expanded">
      <!-- 任务状态按钮：未完成 → 完成 | 完成 → 激活 -->
      <button
        v-if="!task.done"
        class="status-btn status-btn-complete"
        title="点击设为完成"
        @click.stop="$emit('complete', task.id)"
      >✓</button>
      <button
        v-else
        class="status-btn status-btn-activate"
        title="点击重新激活（设为未完成）"
        @click.stop="$emit('activate', task.id)"
      >↻</button>
      <span class="task-idx">#{{ task.index }}</span>
      <div class="task-card-title">
        <span :class="['task-name', { 'task-done': task.done }]">{{ task.name }}</span>
        <span
          v-if="annotCount > 0"
          class="annot-badge"
          :title="`查看 ${annotCount} 条批注`"
          @click.stop="$emit('select-annotation', { taskId: task.id })"
        >📌 {{ annotCount }}</span>
        <button class="btn-annot-quick" :title="task.done ? '查看批注' : '添加/查看批注'" @click.stop="$emit('select-annotation', { taskId: task.id })">📝</button>
      </div>
      <div class="task-card-actions">
        <button class="btn-icon-sm" :disabled="task.done" :title="task.done ? '任务已完成，不可编辑' : '编辑'" @click.stop="$emit('edit', task)">✎</button>
        <button class="btn-icon-sm" :disabled="task.done" :title="task.done ? '任务已完成，不可添加子任务' : '子任务'" @click.stop="$emit('subtask', task)">⋔</button>
        <button class="btn-icon-sm btn-icon-sm-danger" @click.stop="$emit('delete', task.id)" title="删除">✕</button>
      </div>
    </div>
    <div v-if="expanded" class="task-card-body">
      <p v-if="task.description" class="task-desc" v-html="task.description"></p>
      <p v-else class="task-desc" style="color:var(--text-tertiary)">暂无描述</p>

      <div v-if="fileRefsList.length" class="file-refs-row">
        <span class="file-refs-row-label">关联文件</span>
        <span v-for="f in fileRefsList" :key="f.id" class="file-ref-link" @click="openFile(f)">{{ f.name }}</span>
      </div>

      <div v-if="task.subtasks && task.subtasks.length" class="subtask-list">
        <div v-for="s in task.subtasks" :key="s.id" class="subtask-item">
          <!-- 子任务状态按钮：未完成 → 完成 | 完成 → 激活 -->
          <button
            v-if="!s.done"
            class="status-btn status-btn-sm status-btn-complete"
            title="点击设为完成"
            @click.stop="$emit('complete-subtask', task.id, s.id)"
          >✓</button>
          <button
            v-else
            class="status-btn status-btn-sm status-btn-activate"
            title="点击重新激活"
            @click.stop="$emit('activate-subtask', task.id, s.id)"
          >↻</button>
          <div class="subtask-content">
            <span :class="['subtask-name', { 'subtask-done': s.done }]">{{ s.name }}</span>
            <span v-if="s.description" class="subtask-desc" v-html="s.description"></span>
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
            >📌 {{ (s.annotations || []).length }}</span>
            <button class="subtask-annot-quick" :title="s.done ? '查看批注' : '添加/查看批注'" @click.stop="$emit('select-annotation', { taskId: task.id, subtaskId: s.id })">📝</button>
            <button class="subtask-act" :disabled="s.done" :title="s.done ? '子任务已完成，不可编辑' : '编辑子任务'" @click.stop="$emit('edit-subtask', task, s)">✎</button>
            <button class="subtask-del" @click.stop="$emit('delete-subtask', task.id, s.id)" title="删除子任务">✕</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { api } from "../../../api.js";

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

// 默认展开规则：未完成展开，已完成折叠
const expanded = ref(!props.task.done);

// 批注数量（用于显示 📌 徽标）
const annotCount = computed(() => (props.task.annotations || []).length);

// ===== 状态按钮事件全部通过 emit 传父级处理（完成含校验、激活不校验）=====

// ===== 文件引用 =====
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
.task-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
  overflow: hidden;
}
.task-card:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }

/* 两种状态：
   - 默认：正常
   - task-card-done / task-card-locked：完成（浅灰背景 + 虚线边框） */
.task-card-done {
  background: oklch(0.97 0.005 90);
}
.task-card-locked {
  border-style: dashed;
  border-color: oklch(0.78 0.04 80);
}

.task-card-header {
  display: grid;
  grid-template-columns: auto 24px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}

/* 状态按钮：完成 / 激活 */
.status-btn {
  width: 22px;
  height: 22px;
  border: 1px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}
.status-btn-sm { width: 18px; height: 18px; font-size: 11px; }
.status-btn-complete {
  background: transparent;
  color: var(--text-tertiary);
  border-color: oklch(0.78 0.02 80);
}
.status-btn-complete:hover {
  background: oklch(0.95 0.10 90);
  color: oklch(0.55 0.13 80);
  border-color: oklch(0.65 0.13 80);
}
.status-btn-activate {
  background: oklch(0.72 0.13 80);
  color: #fff;
  border-color: oklch(0.65 0.13 80);
}
.status-btn-activate:hover {
  background: oklch(0.65 0.13 80);
  border-color: oklch(0.55 0.13 80);
}

.task-idx {
  color: var(--text-tertiary);
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  text-align: right;
}
.task-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.task-name {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.task-done {
  text-decoration: line-through;
  text-decoration-color: oklch(0.65 0.04 80);
  color: var(--text-tertiary);
}

.task-card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.task-card:hover .task-card-actions { opacity: 1; }

.btn-icon-sm {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-icon-sm:hover { background: var(--bg-hover); color: var(--text); }
.btn-icon-sm-danger:hover { background: oklch(0.93 0.05 30 / 0.3); color: oklch(0.5 0.18 30); }
.btn-icon-sm:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-icon-sm:disabled:hover { background: transparent; color: var(--text-secondary); }

.task-card-body {
  padding: 0 12px 10px calc(12px + 16px + 8px + 24px + 8px);
  animation: slideDown 0.2s ease-out;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.task-desc {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 批注快捷按钮（始终可见） */
.btn-annot-quick {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: oklch(0.97 0.04 85 / 0.6);
  color: oklch(0.50 0.10 80);
  font-size: 13px;
  line-height: 1;
  border-radius: 5px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-annot-quick:hover {
  background: oklch(0.93 0.08 85);
  color: oklch(0.55 0.13 80);
  border-color: oklch(0.85 0.08 85);
}

.subtask-annot-quick {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: oklch(0.97 0.04 85 / 0.6);
  color: oklch(0.50 0.10 80);
  font-size: 12px;
  line-height: 1;
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.subtask-annot-quick:hover {
  background: oklch(0.93 0.08 85);
  color: oklch(0.55 0.13 80);
  border-color: oklch(0.85 0.08 85);
}

/* 批注徽标（仅当有批注时显示） */
.annot-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px;
  border-radius: 10px;
  background: oklch(0.95 0.10 90);
  color: oklch(0.40 0.10 80);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid oklch(0.88 0.08 85);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}
.annot-badge:hover {
  background: oklch(0.92 0.10 85);
  border-color: oklch(0.65 0.13 80);
}
.annot-badge-sm {
  font-size: 10px;
  padding: 1px 6px;
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
  padding: 1px 8px;
  background: oklch(0.95 0.02 240);
  color: oklch(0.40 0.10 240);
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid oklch(0.90 0.02 240);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.file-ref-link:hover {
  background: oklch(0.92 0.04 240);
  border-color: oklch(0.65 0.13 240);
}
.file-ref-sm { font-size: 11px; padding: 1px 6px; }

/* 子任务 */
.subtask-list {
  border-top: 1px solid var(--border-light);
  padding-top: 6px;
  margin-top: 6px;
}
.subtask-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 0;
}
.subtask-check {
  width: 13px;
  height: 13px;
  cursor: pointer;
  accent-color: var(--accent);
  flex-shrink: 0;
  margin-top: 2px;
}
.subtask-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.subtask-name {
  font-size: 13px;
  color: var(--text-secondary);
  display: block;
  word-break: break-word;
}
.subtask-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 1px;
  display: block;
}
.subtask-done {
  text-decoration: line-through;
  color: var(--text-tertiary);
}
.subtask-file-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.subtask-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}
.subtask-item:hover .subtask-actions { opacity: 1; }

.subtask-act, .subtask-del {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}
.subtask-act:hover { background: var(--bg-hover); color: var(--text); }
.subtask-del:hover { background: oklch(0.93 0.05 30 / 0.3); color: oklch(0.5 0.18 30); }
.subtask-act:disabled { opacity: 0.35; cursor: not-allowed; }
.subtask-act:disabled:hover { background: transparent; color: var(--text-secondary); }
</style>