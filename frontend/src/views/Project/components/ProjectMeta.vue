<template>
  <div class="detail-meta">
    <div class="meta-head">
      <span class="meta-title" v-if="project?.name">{{ project.name }}</span>
      <button class="btn-icon-sm" v-if="project" @click="$emit('edit')" title="编辑">✎</button>
    </div>
    <dl class="meta-grid">
      <dt>状态</dt><dd><span :class="['card-status', statusClass(project?.status)]">{{ project?.status || '-' }}</span></dd>
      <dt>描述</dt><dd class="meta-desc">{{ project?.description || '-' }}</dd>
      <dt>成员</dt><dd>{{ (project?.members || []).join('、') || '-' }}</dd>
      <dt>计划</dt><dd>{{ project?.planStart || '-' }} ~ {{ project?.planEnd || '-' }}</dd>
    </dl>
  </div>
</template>

<script setup>
defineProps({ project: Object });
defineEmits(["edit"]);
function statusClass(s) {
  return { "待开始": "status-todo", "进行中": "status-doing", "已完成": "status-done", "已延期": "status-delay" }[s] || "status-todo";
}
</script>

<style scoped>
.detail-meta {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 320px;
}
.meta-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}
.meta-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 16px;
  font-size: 13px;
  flex: 1;
  align-content: start;
}
.meta-grid dt { color: var(--text-secondary); font-weight: 500; line-height: 1.6; }
.meta-grid dd { font-weight: 500; line-height: 1.6; word-break: break-word; }
.meta-desc { color: var(--text-secondary); font-weight: 400; }
.card-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.btn-icon-sm {
  width: 26px; height: 26px;
  border: 1px solid var(--border-light); border-radius: 4px;
  background: transparent; cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}
.btn-icon-sm:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent); }
</style>
