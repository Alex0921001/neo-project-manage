<template>
  <dl class="detail-meta">
    <dt>状态</dt><dd><span :class="['card-status', statusClass(project?.status)]">{{ project?.status }}</span></dd>
    <dt>描述</dt><dd>{{ project?.description || '-' }}</dd>
    <dt>成员</dt><dd>{{ (project?.members || []).join('、') || '-' }}</dd>
    <dt>计划</dt><dd>{{ project?.planStart || '-' }} ~ {{ project?.planEnd || '-' }}</dd>
  </dl>
</template>

<script setup>
defineProps({ project: Object });
function statusClass(s) {
  return { "待开始": "status-todo", "进行中": "status-doing", "已完成": "status-done", "已延期": "status-delay" }[s] || "status-todo";
}
</script>

<style scoped>
.detail-meta {
  display: grid; grid-template-columns: auto 1fr; gap: 8px 16px;
  font-size: 13px; margin-bottom: 24px;
  padding: 16px; background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
}
.detail-meta dt { color: var(--text-secondary); font-weight: 500; }
.detail-meta dd { font-weight: 500; }
</style>
