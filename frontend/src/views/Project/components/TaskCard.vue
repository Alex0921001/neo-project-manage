<template>
  <div :class="['task-card', { 'task-card-done': task.done }]">
    <div class="task-card-header" @click="expanded = !expanded">
      <input type="checkbox" :checked="task.done" @change="$emit('toggle-done', task.id, $event.target.checked)" class="task-check" @click.stop>
      <span class="task-idx">#{{ task.index }}</span>
      <span :class="['task-name', { 'task-done': task.done }]">{{ task.name }}</span>
      <div class="task-card-actions">
        <button class="btn-icon-sm" @click.stop="$emit('edit', task)" title="编辑">✎</button>
        <button class="btn-icon-sm btn-icon-sm-danger" @click.stop="$emit('delete', task.id)" title="删除">✕</button>
      </div>
      <span class="expand-arrow">{{ expanded ? '▾' : '▸' }}</span>
    </div>
    <div v-if="expanded" class="task-card-body">
      <p v-if="task.description" class="task-desc" v-html="task.description"></p>
      <p v-else class="task-desc" style="color:var(--text-tertiary)">暂无描述</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
defineProps({ task: Object });
defineEmits(["toggle-done", "edit", "delete"]);
const expanded = ref(true);
</script>

<style scoped>
.task-card {
  border: 1px solid var(--border-light); border-radius: var(--radius-md);
  background: var(--bg-card); margin-bottom: 8px; overflow: hidden;
  transition: box-shadow var(--duration-fast) var(--ease-out);
}
.task-card:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }
.task-card-done { opacity: 0.55; filter: grayscale(0.6); }
.task-card-header {
  display: grid; grid-template-columns: 16px 24px 1fr auto 16px;
  align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; user-select: none;
}
.task-check { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
.task-done { text-decoration: line-through; color: var(--text-tertiary); }
.task-idx { color: var(--text-tertiary); font-size: 12px; font-family: var(--font-mono, monospace); text-align: right; }
.task-name { font-size: 15px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-card-actions { display: flex; gap: 2px; opacity: 0; transition: opacity var(--duration-fast) var(--ease-out); }
.task-card:hover .task-card-actions { opacity: 1; }
.btn-icon-sm {
  width: 24px; height: 24px; border: none; border-radius: 4px; background: transparent;
  cursor: pointer; font-size: 14px; line-height: 1; display: inline-flex;
  align-items: center; justify-content: center; color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
}
.btn-icon-sm:hover { background: var(--bg-hover); color: var(--text); }
.btn-icon-sm-danger:hover { background: oklch(0.93 0.05 30 / 0.3); color: oklch(0.5 0.18 30); }
.expand-arrow { font-size: 11px; color: var(--text-tertiary); text-align: center; }
.task-card-body { padding: 0 12px 10px calc(12px + 16px + 8px + 24px + 8px); animation: slideDown 0.2s ease-out; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.task-desc { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
</style>
