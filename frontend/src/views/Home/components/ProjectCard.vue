<template>
  <div class="project-card">
    <div class="card-header" @click="$emit('open', project.id)">
      <div class="card-title-row">
        <div class="card-title">{{ setLabel }}-{{ project.name }}</div>
        <span :class="['card-status', statusClass(project.status)]">{{ project.status }}</span>
      </div>
      <div class="card-actions" @click.stop>
        <button class="card-more" title="更多" @click="open = !open">⋯</button>
        <div :class="['card-dropdown', { open }]">
          <button @click="open = false; $emit('edit', project)">✎ 编辑</button>
          <button class="dropdown-danger" @click="open = false; $emit('delete', project)">✕ 删除</button>
        </div>
      </div>
    </div>
    <div class="card-body" @click="$emit('open', project.id)">
      <div class="card-desc">{{ project.description || '无描述' }}</div>
      <div class="card-stats-row">
        <span class="stat-item">📋 任务 {{ project.incompleteTaskCount || 0 }}/{{ project.taskCount || 0 }}</span>
        <span class="stat-item">📁 文件 {{ project.fileCount || 0 }}</span>
        <span class="stat-item">📝 备注 {{ project.noteCount || 0 }}</span>
      </div>
      <div class="card-date">{{ project.planStart || '?' }} ~ {{ project.planEnd || '?' }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  project: { type: Object, required: true },
  setLabel: { type: String, default: "未归类" },
});
defineEmits(["open", "edit", "delete"]);

const open = ref(false);

function statusClass(s) {
  return { "待开始": "status-todo", "进行中": "status-doing", "已完成": "status-done", "已延期": "status-delay" }[s] || "status-todo";
}
</script>

<style scoped>
.project-card {
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  transition: all var(--duration-normal) var(--ease-out);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.project-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); border-color: var(--border); }
.card-header { display: flex; align-items: flex-start; padding: 24px 24px 0; cursor: pointer; }
.card-title-row {
  flex: 1; display: flex; align-items: center; gap: 8px;
  min-width: 0;
}
.card-title {
  font-weight: 600; font-size: 16px;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.card-body { padding: 12px 24px 24px; cursor: pointer; }
.card-actions { position: relative; flex-shrink: 0; }
.card-more {
  width: 24px; height: 24px; border: 1px solid transparent; border-radius: var(--radius-sm);
  background: none; cursor: pointer; font-size: 16px; line-height: 1; color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center; opacity: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.project-card:hover .card-more { opacity: 1; }
.card-more:hover { border-color: var(--border-light); background: var(--bg-hover); }
.card-dropdown {
  display: none; position: absolute; top: 28px; right: 0;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-md);
  z-index: 100; min-width: 110px; padding: 4px 0;
  animation: dropIn var(--duration-fast) var(--ease-out);
}
.card-dropdown.open { display: block; }
.card-dropdown button {
  display: block; width: 100%; padding: 7px 14px; border: none; background: none; cursor: pointer;
  font-size: 12px; text-align: left; color: var(--text);
  transition: background var(--duration-fast) var(--ease-out);
}
.card-dropdown button:hover { background: var(--bg-hover); }
.card-desc {
  font-size: 13px; color: var(--text-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin-bottom: 10px; line-height: 1.5;
}
.card-status {
  display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
  flex-shrink: 0;
}
.card-stats-row {
  display: flex; gap: 14px; margin-bottom: 6px;
}
.stat-item { font-size: 12px; color: var(--text-secondary); }
.card-date { font-size: 11px; color: var(--text-tertiary); }
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
