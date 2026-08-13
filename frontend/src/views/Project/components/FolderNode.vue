<template>
  <div class="fn-wrap">
    <div
      class="fn-row"
      :class="{ active: isActive, 'drop-hover': dropHover }"
      :style="{ paddingLeft: `${6 + depth * 16}px` }"
      @click="$emit('select', node.id)"
      @contextmenu.prevent="$emit('menu', { folder: node, event: $event })"
      @dragover.prevent="dropHover = true"
      @dragleave="dropHover = false"
      @drop.prevent="onDrop"
    >
      <span class="fn-arrow" :class="{ open: expanded, leaf: !hasChildren }" @click.stop="toggle">
        <svg v-if="hasChildren" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
      </span>
      <svg class="fn-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span class="fn-name" :title="node.name">{{ node.name }}</span>
    </div>
    <template v-if="expanded">
      <FolderNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        @select="$emit('select', $event)"
        @menu="$emit('menu', $event)"
        @drop-file="$emit('drop-file', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  /** 全局当前选中的文件夹 id（节点自判高亮，递归透传） */
  selectedId: { type: String, default: "" },
});
const emit = defineEmits(["select", "menu", "drop-file"]);

const expanded = ref(true);
const dropHover = ref(false);

const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0);
const isActive = computed(() => props.node.id === props.selectedId);

function toggle() {
  expanded.value = !expanded.value;
}

function onDrop() {
  dropHover.value = false;
  emit("drop-file", props.node.id);
}
</script>

<style scoped>
.fn-wrap { min-width: 0; }
.fn-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding-right: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  transition: background var(--duration-fast) var(--ease-out);
}
.fn-row:hover { background: var(--bg-hover); color: var(--text); }
.fn-row.active { background: var(--bg-hover); color: var(--text); font-weight: 600; }
.fn-row.drop-hover { background: var(--accent); color: #fff; }
.fn-arrow {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.fn-arrow svg { transition: transform var(--duration-fast) var(--ease-out); }
.fn-arrow.open svg { transform: rotate(90deg); }
.fn-folder-icon { color: var(--text-secondary); flex-shrink: 0; }
.fn-row.active .fn-folder-icon { color: var(--text); }
.fn-name {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
</style>
