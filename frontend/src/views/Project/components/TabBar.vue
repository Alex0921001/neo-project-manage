<template>
  <div class="border-card-tabs">
    <div class="border-tab-bar">
      <button class="border-tab" :class="{ active: modelValue === 'tasks' }" @click="$emit('update:modelValue', 'tasks')">
        📋 任务 <span class="tab-count">{{ taskCount }}</span>
      </button>
      <button class="border-tab" :class="{ active: modelValue === 'files' }" @click="$emit('update:modelValue', 'files')">
        📁 文件 <span class="tab-count">{{ fileCount }}</span>
      </button>
      <button class="border-tab" :class="{ active: modelValue === 'notes' }" @click="$emit('update:modelValue', 'notes')">
        📝 备注 <span class="tab-count">{{ noteCount }}</span>
      </button>
      <div class="tab-bar-spacer"></div>
      <div class="tab-bar-action"><slot name="action"></slot></div>
    </div>
    <div class="border-tab-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: String,
  taskCount: { type: Number, default: 0 },
  fileCount: { type: Number, default: 0 },
  noteCount: { type: Number, default: 0 },
});
defineEmits(["update:modelValue"]);
</script>

<style scoped>
.border-card-tabs {
  border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;
  margin-bottom: 16px; display: flex; flex-direction: column; flex: 1; min-height: 0;
}
.border-tab-bar { display: flex; background: var(--bg-hover); border-bottom: 1px solid var(--border); }
.tab-bar-spacer { flex: 1; }
.tab-bar-action { padding: 4px 6px; display: flex; align-items: center; }
.border-tab {
  padding: 8px 14px; border: none; border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border); margin-bottom: -1px;
  background: transparent; cursor: pointer; font-size: 13px; font-weight: 500;
  font-family: inherit; color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out); white-space: nowrap;
}
.border-tab:last-child { border-right: none; }
.border-tab:hover { color: var(--text-secondary); background: oklch(0.93 0.005 270); }
.border-tab.active { background: var(--bg-card); color: var(--accent); border-bottom-color: var(--bg-card); }
.border-tab-content {
  background: var(--bg-card); padding: 16px; flex: 1; overflow-y: auto; min-height: 0;
  display: flex; flex-direction: column;
}
.tab-count {
  display: inline-block; background: var(--accent-subtle); color: var(--accent);
  font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 10px;
  margin-left: 4px; vertical-align: middle; line-height: 1.4;
}
</style>
