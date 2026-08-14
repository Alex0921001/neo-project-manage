<template>
  <div class="fn-wrap">
    <div
      class="fn-row"
      :class="{ active: isActive, 'drop-hover': dropHover, 'drop-disabled': dragDisabled }"
      :style="{ paddingLeft: `${6 + depth * 16}px` }"
      draggable="true"
      @click="$emit('select', node.id)"
      @contextmenu.prevent="$emit('menu', { folder: node, event: $event })"
      @dragover.prevent="onDragOver"
      @dragleave="dropHover = false"
      @drop.prevent.stop="onDrop"
      @dragstart="onDragStart"
    >
      <span class="fn-arrow" :class="{ open: isExpanded, leaf: !hasChildren }" @click.stop="$emit('toggle', node.id)">
        <svg v-if="hasChildren" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
      </span>
      <svg class="fn-folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="rgb(255,247,209)" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <!-- 行内编辑：原处 input 替换名称（回车/失焦保存，Esc 取消） -->
      <input
        v-if="isEditing"
        ref="editInput"
        class="fn-edit-input"
        maxlength="30"
        :value="editingValue"
        @input="$emit('update:editing-value', $event.target.value)"
        @keyup.enter.stop="$emit('commit-edit')"
        @keyup.esc.stop="$emit('cancel-edit')"
        @blur="$emit('commit-edit')"
        @click.stop
      />
      <span v-else class="fn-name" :title="node.name">{{ node.name }}</span><span v-if="fileCount" class="fn-count">({{ fileCount }})</span>
    </div>

    <template v-if="isExpanded">
      <FolderNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        :expanded-ids="expandedIds"
        :editing-id="editingId"
        :editing-value="editingValue"
        :new-parent-id="newParentId"
        :new-value="newValue"
        :drag-folder-id="dragFolderId"
        :file-counts="fileCounts"
        @select="$emit('select', $event)"
        @menu="$emit('menu', $event)"
        @drop="$emit('drop', $event)"
        @dragstart-folder="$emit('dragstart-folder', $event)"
        @drop-hover="$emit('drop-hover')"
        @toggle="$emit('toggle', $event)"
        @update:editing-value="$emit('update:editing-value', $event)"
        @commit-edit="$emit('commit-edit')"
        @cancel-edit="$emit('cancel-edit')"
        @update:new-value="$emit('update:new-value', $event)"
        @commit-new="$emit('commit-new')"
        @cancel-new="$emit('cancel-new')"
      />
      <!-- 新建输入行：本节点为新建父级时，在其子级尾部渲染（缩进对齐） -->
      <div
        v-if="showNewInput"
        class="fn-row fn-new-row"
        :style="{ paddingLeft: `${6 + (depth + 1) * 16}px` }"
        @click.stop
      >
        <span class="fn-arrow"></span>
        <svg class="fn-folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="rgb(255,247,209)" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <input
          ref="newInput"
          class="fn-edit-input"
          maxlength="30"
          :value="newValue"
          placeholder="新建文件夹"
          @input="$emit('update:new-value', $event.target.value)"
          @keyup.enter.stop="$emit('commit-new')"
          @keyup.esc.stop="$emit('cancel-new')"
          @blur="$emit('commit-new')"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  /** 全局当前选中的文件夹 id（节点自判高亮，递归透传） */
  selectedId: { type: String, default: "" },
  /** 展开集合（父级管理，节点自判，递归透传） */
  expandedIds: { type: Set, default: () => new Set() },
  /** 当前正在行内编辑的文件夹 id（本节点命中时显示 input） */
  editingId: { type: String, default: "" },
  editingValue: { type: String, default: "" },
  /** 新建输入行的父级 id（本节点命中时子级尾部显示 input） */
  newParentId: { type: String, default: "" },
  newValue: { type: String, default: "" },
  /** 当前拖拽中的文件夹 id（递归透传，用于自身/子孙放置禁用判断） */
  dragFolderId: { type: String, default: "" },
  /** 文件夹 id → 文件数（递归统计，含子孙夹内文件；FileTab 计算后透传） */
  fileCounts: { type: Object, default: () => ({}) },
});
const emit = defineEmits([
  "select", "menu", "drop", "dragstart-folder", "toggle",
  "drop-hover",
  "update:editing-value", "commit-edit", "cancel-edit",
  "update:new-value", "commit-new", "cancel-new",
]);

const dropHover = ref(false);
const editInput = ref(null);
const newInput = ref(null);

const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0);
const isActive = computed(() => props.node.id === props.selectedId);
const isExpanded = computed(() => props.expandedIds.has(props.node.id));
const isEditing = computed(() => props.node.id === props.editingId);
/** 本节点文件数（自己夹内直接文件数；0 时前端不渲染） */
const fileCount = computed(() => props.fileCounts[props.node.id] ?? 0);
/** 本节点为新建父级时渲染输入行；父级必须展开（FileTab 设置时已强制展开） */
const showNewInput = computed(() => props.node.id === props.newParentId && isExpanded.value);
/** 拖拽禁用：文件夹拖拽时目标为自己或自己的子孙（不可放置） */
const dragDisabled = computed(() => {
  if (!props.dragFolderId) return false; // 文件拖拽或无拖拽，不禁用
  if (props.dragFolderId === props.node.id) return true;
  return subtreeHas(props.node, props.dragFolderId);
});
const canDrop = computed(() => !dragDisabled.value);

function subtreeHas(n, id) {
  for (const c of n.children || []) {
    if (c.id === id) return true;
    if (subtreeHas(c, id)) return true;
  }
  return false;
}

// 编辑/新建输入框自动聚焦
watch(isEditing, (v) => { if (v) nextTick(() => editInput.value?.focus()); });
watch(showNewInput, (v) => { if (v) nextTick(() => newInput.value?.focus()); });

function toggle() {
  emit("toggle", props.node.id);
}

function onDragStart(e) {
  emit("dragstart-folder", props.node.id);
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", props.node.id); } catch { /* ignore */ }
  }
}

function onDragOver(e) {
  e.stopPropagation(); // 阻止冒泡到左侧空白（空白=根目录目标）
  if (canDrop.value) {
    dropHover.value = true;
    emit("drop-hover"); // 通知父级：子文件夹优先，根目录放置高亮让位（互斥）
  } else {
    // 禁用放置：明确拒绝 dropEffect，避免浏览器默认光标误导
    try { e.dataTransfer.dropEffect = "none"; } catch { /* ignore */ }
  }
}

function onDrop(e) {
  dropHover.value = false;
  if (!canDrop.value) return; // 自身/子孙禁用放置
  emit("drop", { targetId: props.node.id });
}
</script>

<style scoped>
.fn-wrap { min-width: 0; }
.fn-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding-right: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 15px;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  transition: background var(--duration-fast) var(--ease-out);
}
.fn-row:hover { background: var(--bg-hover); color: var(--text); }
.fn-row.active { background: var(--bg-hover); color: var(--text); font-weight: 600; }
.fn-row.drop-hover { background: var(--accent-warm); color: #fff; }
.fn-row.drop-disabled { cursor: not-allowed; opacity: 0.55; }
.fn-row.drop-disabled:hover { background: transparent; color: var(--text-tertiary); }
.fn-row[draggable="true"] { cursor: grab; }
.fn-row[draggable="true"]:active { cursor: grabbing; }
.fn-arrow {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.fn-arrow svg { transition: transform var(--duration-fast) var(--ease-out); }
.fn-arrow.open svg { transform: rotate(90deg); }
.fn-folder-icon { color: var(--accent-warm); flex-shrink: 0; }
.fn-row.active .fn-folder-icon { color: var(--accent-warm-hover); }
.fn-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  color: var(--text);
}
.fn-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}
.fn-new-row { cursor: default; color: var(--text-tertiary); }
.fn-edit-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--accent-warm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--text);
  background: var(--bg-card);
  outline: none;
}
</style>
