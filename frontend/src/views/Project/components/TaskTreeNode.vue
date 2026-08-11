<template>
  <div class="tree-node">
    <!-- 节点行：点击选中，箭头独立切换展开 -->
    <div
      class="tree-row"
      :class="{ 'tree-row-selected': selected, 'tree-row-done': task.done }"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      :title="task.name"
      @click="emit('select', task.id)"
    >
      <span
        class="tree-arrow"
        :class="{ 'tree-arrow-open': expanded, 'tree-arrow-hidden': !hasChildren }"
        @click.stop="toggle"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
      <span class="tree-name">{{ task.name }}</span>
      <span v-if="pendingCount > 0" class="tree-badge">{{ pendingCount }}</span>
    </div>
    <!-- 子任务递归 -->
    <div v-show="expanded && hasChildren" class="tree-children">
      <TaskTreeNode
        v-for="sub in task.subtasks"
        :key="sub.id"
        :task="sub"
        :depth="depth + 1"
        :selected-id="selectedId"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  task: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  selectedId: { type: String, default: "" },
});
const emit = defineEmits(["select"]);

// 顶层默认展开，子级默认折叠
const expanded = ref(props.depth === 0);

const hasChildren = computed(() => (props.task?.subtasks || []).length > 0);
const pendingCount = computed(() => (props.task?.annotations || []).filter((a) => !a.confirmed).length);
const selected = computed(() => props.task.id === props.selectedId);

function toggle() {
  if (hasChildren.value) expanded.value = !expanded.value;
}
</script>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 8px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background var(--duration-fast) var(--ease-out);
  user-select: none;
}
.tree-row:hover {
  background: var(--bg-hover);
}
.tree-row-selected {
  background: var(--accent-subtle);
  border-left-color: var(--accent-warm);
  font-weight: 600;
}
.tree-row-done .tree-name {
  color: var(--text-tertiary);
  text-decoration: line-through;
}
.tree-arrow {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out);
}
.tree-arrow-open {
  transform: rotate(180deg);
}
.tree-arrow-hidden {
  visibility: hidden;
}
.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-badge {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--accent-warm);
  color: var(--bg-card);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.tree-children {
  /* 子级行内缩进由 paddingLeft 控制 */
}
</style>
