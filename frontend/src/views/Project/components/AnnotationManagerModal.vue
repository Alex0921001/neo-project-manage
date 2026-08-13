<template>
  <FloatPanel
    :model-value="modelValue"
    title="批注管理"
    :default-width="960"
    :default-height="600"
    :min-width="350"
    :min-height="420"
    :max-width="1600"
    :max-height="1000"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @resize="onResize"
  >
    <div class="annot-mgr-body">
      <!-- 左：任务树（可整列折叠） -->
      <div v-show="!treeCollapsed" class="annot-mgr-tree">
        <div class="annot-mgr-tree-head">
          <span class="annot-mgr-tree-title">任务树</span>
          <span class="annot-mgr-tree-hint">未确认批注数</span>
          <button class="annot-mgr-fold" title="收起任务树" @click="treeCollapsed = true">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>
        <div class="annot-mgr-tree-list">
          <!-- 全部任务：显示项目全部批注（隐藏新增入口） -->
          <div
            class="tree-row annot-mgr-all"
            :class="{ 'tree-row-selected': selectedTaskId === ALL_KEY }"
            title="全部任务"
            @click="selectedTaskId = ALL_KEY"
          >
            <span class="tree-arrow tree-arrow-hidden">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
            </span>
            <span class="tree-name">全部任务</span>
            <span v-if="allAnnCount > 0" class="tree-badge">{{ allAnnCount }}</span>
          </div>
          <template v-if="tasks.length">
            <TaskTreeNode
              v-for="t in tasks"
              :key="t.id"
              :task="t"
              :depth="0"
              :selected-id="selectedTaskId"
              @select="onSelect"
            />
          </template>
          <div v-else class="annot-mgr-tree-empty">项目暂无任务</div>
        </div>
      </div>
      <!-- 折叠后展开按钮（左边缘竖条） -->
      <button v-if="treeCollapsed" class="annot-mgr-unfold" title="展开任务树" @click="treeCollapsed = false">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <!-- 右：批注管理（内嵌便利贴面板；全部任务模式展示全项目批注） -->
      <div class="annot-mgr-panel">
        <AnnotationPanel
          v-if="selectedTask || allMode"
          :project-id="projectId"
          :task="selectedTask"
          :tasks="tasks"
          :all-mode="allMode"
          embedded
          @changed="emit('changed')"
        />
        <div v-else class="annot-mgr-panel-empty">请选择左侧任务</div>
      </div>
    </div>
  </FloatPanel>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import TaskTreeNode from "./TaskTreeNode.vue";
import AnnotationPanel from "./AnnotationPanel.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectId: { type: String, required: true },
  tasks: { type: Array, default: () => [] },
  initialTaskId: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue", "changed"]);

const selectedTaskId = ref("");
// 任务树整列折叠开关
const treeCollapsed = ref(false);
// 「全部任务」特殊选项 key：显示项目全部批注
const ALL_KEY = "__all__";

// 递归按 id 查找任务（任意层级）
function findTaskInTree(tasks, id) {
  if (id === ALL_KEY) return null; // 全部任务非真实任务
  for (const t of tasks || []) {
    if (t.id === id) return t;
    const sub = findTaskInTree(t.subtasks, id);
    if (sub) return sub;
  }
  return null;
}

// 全部模式：选中「全部任务」
const allMode = computed(() => selectedTaskId.value === ALL_KEY);
// 全部批注总数（任务树徽标）
const allAnnCount = computed(() => {
  let n = 0;
  const walk = (list) => {
    for (const t of list || []) {
      n += (t.annotations || []).length;
      walk(t.subtasks);
    }
  };
  walk(props.tasks);
  return n;
});

const selectedTask = computed(() => findTaskInTree(props.tasks, selectedTaskId.value));

function onSelect(id) {
  selectedTaskId.value = id;
}

// 3.3：面板宽度 <500px 时自动收起任务树（只留批注面板），展开按钮可恢复
// 只在跨越 500px 边界时自动收起，避免打断用户手动展开
let lastWidth = 0;
function onResize({ width }) {
  const w = Number(width) || 0;
  if (w < 500 && lastWidth >= 500) treeCollapsed.value = true;
  lastWidth = w;
}

// 打开时：优先选中入口任务（initialTaskId）；否则第一个任务
function onOpen() {
  // 初始宽度 960（FloatPanel 默认值），供 onResize 边沿判断
  lastWidth = 960;
  if (props.initialTaskId && findTaskInTree(props.tasks, props.initialTaskId)) {
    selectedTaskId.value = props.initialTaskId;
  } else if (props.tasks?.length) {
    selectedTaskId.value = props.tasks[0].id;
  } else {
    selectedTaskId.value = "";
  }
}

watch(() => props.modelValue, (v) => {
  if (v) onOpen();
});
</script>

<style scoped>
.annot-mgr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  padding: 14px;
}
/* 左：任务树 */
.annot-mgr-tree {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  overflow: hidden;
}
.annot-mgr-tree-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.annot-mgr-tree-title {
  flex-shrink: 0;
}
.annot-mgr-tree-hint {
  flex: 1;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--text-tertiary);
}
/* 折叠/展开按钮 */
.annot-mgr-fold {
  width: 22px; height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.annot-mgr-fold:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.annot-mgr-unfold {
  width: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.annot-mgr-unfold:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.annot-mgr-tree-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0;
}
/* 「全部任务」选项：对齐 TaskTreeNode .tree-row 样式（scoped 隔离，需本地复刻） */
.annot-mgr-all {
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
.annot-mgr-all:hover {
  background: var(--bg-hover);
}
.annot-mgr-all.tree-row-selected {
  background: var(--accent-subtle);
  border-left-color: var(--accent-warm);
  font-weight: 600;
}
.annot-mgr-all .tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annot-mgr-all .tree-arrow {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}
.annot-mgr-all .tree-arrow svg {
  width: 10px;
  height: 10px;
}
.annot-mgr-all .tree-badge {
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
.annot-mgr-tree-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}
/* 右：批注面板 */
.annot-mgr-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.annot-mgr-panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
