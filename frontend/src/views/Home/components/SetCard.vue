<template>
  <div
    :class="['set-card', { active: isActive }]"
    @click="$emit('select', set.id)"
  >
    <div class="set-header">
      <div class="set-name">{{ set.name }}</div>
      <div class="set-actions" @click.stop>
        <button class="set-more" title="更多" @click="open = !open">⋯</button>
        <div :class="['set-dropdown', { open }]">
          <button @click="open = false; $emit('edit', set)">✎ 编辑</button>
          <button class="dropdown-danger" @click="open = false; $emit('delete', set)">✕ 删除</button>
        </div>
      </div>
    </div>
    <div class="set-meta">{{ set.projectCount }} 个项目</div>
  </div>
</template>

<script setup>
import { ref } from "vue";

defineProps({
  set: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
});
defineEmits(["select", "edit", "delete"]);

const open = ref(false);
</script>

<style scoped>
.set-card {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  margin-bottom: 6px;
  border: 1px solid transparent;
  position: relative;
}
.set-card:hover { background: var(--bg-hover); }
.set-card.active {
  background: var(--accent-subtle);
  border-color: var(--accent);
}
.set-card.active::before {
  content: "";
  position: absolute;
  left: -16px; top: 50%;
  transform: translateY(-50%);
  width: 3px; height: 20px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.set-header { display: flex; align-items: center; gap: 4px; }
.set-name {
  flex: 1; font-weight: 600; font-size: 13px;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.set-meta { font-size: 12px; color: var(--text-tertiary); margin-top: 3px; }
.set-actions { position: relative; }
.set-more {
  width: 24px; height: 24px;
  border: 1px solid transparent; border-radius: var(--radius-sm);
  background: none; cursor: pointer;
  font-size: 16px; line-height: 1; color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.set-card:hover .set-more { opacity: 1; }
.set-more:hover { border-color: var(--border-light); background: var(--bg-hover); }
.set-dropdown {
  display: none;
  position: absolute; top: 28px; right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 100; min-width: 110px; padding: 4px 0;
  animation: dropIn var(--duration-fast) var(--ease-out);
}
.set-dropdown.open { display: block; }
.set-dropdown button {
  display: block; width: 100%;
  padding: 7px 14px; border: none; background: none; cursor: pointer;
  font-size: 12px; text-align: left; color: var(--text);
  transition: background var(--duration-fast) var(--ease-out);
}
.set-dropdown button:hover { background: var(--bg-hover); }
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
