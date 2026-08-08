<template>
  <!-- 任务卡：支持任意层级（顶层 / 子任务 / 孙任务）
       - depth=0：顶层任务（在 TaskTab 的 vuedraggable 里）
       - depth=1：子任务（在父 TaskCard 的 vuedraggable 里，支持拖拽排序）
       - depth=2+：孙任务（不拖拽，仅展示 + 增删改）-->
  <div
    :class="[
      'task-card',
      `task-card-depth-${depth}`,
      { 'task-card-done': task.done, 'task-card-locked': task.done, 'task-card-flash': flashing }
    ]"
    :data-task-id="task.id"
  >
    <div class="task-card-header" @click="expanded = !expanded" :data-connector-id="`task-${task.id}`">
      <span class="drag-handle" :class="{ 'drag-handle-disabled': !draggable_drag }" :title="draggable_drag ? '拖动重新排序' : ''" @click.stop>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>
      </span>
      <button
        v-if="!task.done"
        class="status-btn status-btn-complete"
        title="点击设为完成"
        @click.stop="onComplete"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
      <button
        v-else
        class="status-btn status-btn-activate"
        title="点击重新激活（设为未完成）"
        @click.stop="onActivate"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
      </button>
      <span class="task-idx">{{ task.index_num != null ? task.index_num + 1 : '' }}</span>
      <div class="task-card-title">
        <span :class="['task-name', { 'task-done': task.done }]" v-html="highlight(task.name, searchQuery)"></span>
        <span
          v-if="annotTotal > 0"
          class="annot-badge"
          :class="{ 'annot-all-done': pendingCount === 0 }"
          :title="`${confirmedCount} 条已确认 · ${pendingCount} 条待确认`"
          @click.stop="$emit('select-annotation', { taskId: task.id })"
        >
          <span v-if="confirmedCount > 0" class="annot-seg annot-seg-ok">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            {{ confirmedCount }}
          </span>
          <span v-if="pendingCount > 0" class="annot-seg annot-seg-pending">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            {{ pendingCount }}
          </span>
        </span>
        <button
          v-if="!task.done && annotTotal === 0"
          class="icon-btn"
          title="添加批注"
          @click.stop="$emit('select-annotation', { taskId: task.id })"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>
      <div class="task-card-actions">
        <button v-if="!task.done" class="icon-btn" title="编辑" @click.stop="$emit('edit', task)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <!-- + 子任务按钮：所有层级都有 -->
        <button v-if="!task.done" class="icon-btn" title="添加子任务" @click.stop="$emit('subtask', task)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="icon-btn icon-btn-danger" @click.stop="$emit('delete', task.id)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
        <button class="icon-btn" title="复制 id: 名称" @click.stop="copyTask">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    </div>
    <div v-if="expanded" class="task-card-body">
      <div v-if="task.description" class="task-desc rich-view" v-html="highlightRichText(formatDescription(task.description), searchQuery)" @click="onRichClick"></div>
      <div v-else class="task-desc task-desc-empty">暂无描述</div>
      <teleport to="body">
        <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
      </teleport>

      <!-- 成员 + 起止日期 -->
      <div v-if="task.assignees?.length || task.startDate || task.endDate" class="task-meta-row">
        <span v-if="task.assignees?.length" class="task-meta-chip task-meta-chip-person">成员：{{ task.assignees.join('、') }}</span>
        <span v-if="task.startDate || task.endDate" class="task-meta-chip">日期：{{ task.startDate || '…' }} ~ {{ task.endDate || '…' }}</span>
      </div>

      <div v-if="fileRefsList.length" class="file-refs-row">
        <span class="file-refs-row-label">关联文件</span>
        <span v-for="f in fileRefsList" :key="f.id" class="file-ref-link" title="双击打开" @dblclick="openFile(f)">{{ f.name }}</span>
      </div>

      <!-- 子任务列表（递归渲染） -->
      <!-- depth 0（顶层卡片）渲染子任务时支持拖拽；depth>=1 渲染后代用普通列表，避免嵌套 draggable -->
      <draggable
        v-if="(task.subtasks || []).length && draggable_drag"
        :list="subtasksLocal"
        item-key="id"
        handle=".drag-handle"
        ghost-class="subtask-ghost"
        :animation="180"
        group="tasks"
        :disabled="searchQuery ? true : false"
        class="subtask-list"
        @end="onSubtaskDragEnd"
      >
        <template #item="{ element: s }">
          <TaskCard
            :task="s"
            :files="files"
            :search-query="searchQuery"
            :project-id="projectId"
            :expand-all="expandAll"
            :depth="depth + 1"
            @mark-task-done="$emit('mark-task-done', $event)"
            @edit="$emit('edit-subtask', task, s)"
            @edit-subtask="$emit('edit-subtask', $event)"
            @subtask="$emit('subtask', $event)"
            @delete="$emit('delete-task-deep', s.id)"
            @delete-task-deep="$emit('delete-task-deep', $event)"
            @select-annotation="$emit('select-annotation', $event)"
            @changed="$emit('changed')"
          />
        </template>
      </draggable>
      <div v-else-if="(task.subtasks || []).length" class="subtask-list">
        <TaskCard
          v-for="s in (task.subtasks || [])"
          :key="s.id"
          :task="s"
          :files="files"
          :search-query="searchQuery"
          :project-id="projectId"
          :expand-all="expandAll"
          :depth="depth + 1"
          @mark-task-done="$emit('mark-task-done', $event)"
          @edit="$emit('edit-subtask', task, s)"
          @edit-subtask="$emit('edit-subtask', $event)"
          @subtask="$emit('subtask', $event)"
          @delete="$emit('delete-task-deep', s.id)"
          @delete-task-deep="$emit('delete-task-deep', $event)"
          @select-annotation="$emit('select-annotation', $event)"
          @changed="$emit('changed')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";
import { formatDescription } from "../../../utils/text.js";
import { useRichImagePreview } from "../../../utils/richImagePreview.js";
import { highlight, highlightRichText } from "../../../utils/highlight.js";
import draggable from "vuedraggable";
import { toast } from "../../../toast.js";

// 递归组件需要 name（Vue 3 setup 语法下用 defineOptions 或文件名）
defineOptions({ name: "TaskCard" });

const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const props = defineProps({
  task: { type: Object, required: true },
  files: { type: Array, default: () => [] },
  searchQuery: { type: String, default: "" },
  projectId: { type: String, default: "" },
  expandAll: { type: Boolean, default: null },
  depth: { type: Number, default: 0 },        // 0=顶层，1=子任务，2=孙任务
});
const emit = defineEmits([
  "mark-task-done",
  "edit",
  "edit-subtask",
  "subtask",
  "delete",
  "delete-task-deep",
  "select-annotation",
  "changed",
]);

// 展开状态：未点过一键展开/收起时按默认（未完成展开、已完成折叠）；
// 显式展开/收起（expandAll 为 true/false）时，初始化也直接跟随（后创建的嵌套卡片同样生效）
const expanded = ref(
  props.expandAll !== null && props.expandAll !== undefined
    ? props.expandAll
    : !props.task.done
);
const flashing = ref(false);

// 监听全局展开/收起
watch(() => props.expandAll, (val) => {
  if (val !== null && val !== undefined) expanded.value = val;
});

// 搜索状态下强制展开（已完成任务默认折叠，搜索时看不到命中位置）
// 清空搜索后恢复默认：未完成展开、已完成折叠
watch(() => props.searchQuery, (q) => {
  if (q && q.trim()) expanded.value = true;
  else expanded.value = !props.task.done;
});

// 仅顶层卡片（depth 0）渲染子任务时支持拖拽；depth>=1 渲染后代用普通列表（嵌套 draggable 不稳）
const draggable_drag = computed(() => props.depth < 1);

const annotList = computed(() => props.task.annotations || []);
const annotTotal = computed(() => annotList.value.length);
const confirmedCount = computed(() => annotList.value.filter((a) => a.confirmed).length);
const pendingCount = computed(() => annotTotal.value - confirmedCount.value);

// 子任务本地镜像（用于拖拽乐观更新）
const subtasksLocal = ref([...(props.task.subtasks || [])]);
watch(() => props.task.subtasks, (v) => {
  subtasksLocal.value = [...(v || [])];
}, { deep: false });

let subSaveTimer = null;
function scheduleSave() {
  if (!props.projectId) return;
  if (subSaveTimer) clearTimeout(subSaveTimer);
  subSaveTimer = setTimeout(async () => {
    subSaveTimer = null;
    const ids = subtasksLocal.value.map(s => s.id);
    const res = await api(
      `api/projects/${props.projectId}/tasks/${props.task.id}/reorder-subtasks`,
      { method: "POST", body: JSON.stringify({ subtaskIds: ids }) }
    );
    if (!res?.ok) {
      toast(`子任务排序保存失败：${res?.error || "未知错误"}`, "error");
      emit("changed");
    }
  }, 500);
}

function onSubtaskDragEnd(event) {
  // 跨容器（拖到顶层 / 其他任务下）：变更父级
  if (event.from !== event.to) {
    handleCrossMove(event);
    return;
  }
  scheduleSave();
}

/**
 * 跨容器落点：目标容器在某个 .task-card 内则为该任务的子级，否则为顶层
 */
async function handleCrossMove(event) {
  const toEl = event.to;
  const taskId = event.item ? event.item.getAttribute("data-task-id") : null;
  if (!toEl || !taskId) return;
  const parentCard = toEl.closest(".task-card");
  const parentTaskId = parentCard ? parentCard.getAttribute("data-task-id") : null;
  const index = event.newIndex ?? 0;
  const res = await api(`api/projects/${props.projectId}/tasks/${taskId}/move`, {
    method: "POST",
    body: JSON.stringify({ parentTaskId, index }),
  });
  if (!res?.ok) toast(res?.error || "移动失败", "error");
  emit("changed");
}

// 文件引用
const fileRefsList = computed(() => {
  const ids = props.task.fileRefs || [];
  return ids.map((id) => props.files.find((f) => f.id === id)).filter(Boolean);
});

async function openFile(f) {
  if (!f?.path) return;
  await api(`api/open-file?path=${encodeURIComponent(f.path)}`);
}

function onComplete() {
  // 统一传整个 task 对象，TaskTab 根据 parent_task_id 字段判断 API 路径
  emit("mark-task-done", { task: props.task, done: true });
}
function onActivate() {
  emit("mark-task-done", { task: props.task, done: false });
}

// 复制到剪贴板（webview 内 Clipboard API 被 Permissions Policy 阻止，直接用 execCommand）
function copyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) toast("已复制");
    else toast("复制失败", "error");
  } catch (err) {
    toast("复制失败", "error");
  }
}

function copyTask() {
  if (!props.task) return;
  copyText(`使用项目管理插件工具搜索：【任务 id:${props.task.id}】 ${props.task.name || ""} 的具体内容。`);
}

// 递归子节点标记完成 / 激活（直接 emit mark-task-done，由 TaskTab 统一处理）

// 暴露闪烁 API（外部可调用，让新建的任务闪烁）
defineExpose({
  flash() { flashing.value = true; setTimeout(() => flashing.value = false, 1500); }
});
</script>

<style scoped>
/* ===== 基础：贴纸质感、暖色调 ===== */
.task-card {
  position: relative;
  background: oklch(0.995 0.01 85);
  border: 1px solid oklch(0.88 0.04 85);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 2px oklch(0.5 0.04 80 / 0.06), 0 2px 6px oklch(0.5 0.04 80 / 0.04);
  transition: all var(--duration-fast) var(--ease-out);
  overflow: hidden;
}
.task-card::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: oklch(0.72 0.13 80);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.task-card:hover {
  border-color: oklch(0.82 0.06 80);
  box-shadow: 0 1px 3px oklch(0.5 0.05 80 / 0.10), 0 6px 14px oklch(0.5 0.04 80 / 0.08);
  transform: translateY(-1px);
}
.task-card:hover::before { opacity: 1; }

.task-card-done {
  background: oklch(0.95 0.06 145);
  border-color: oklch(0.82 0.08 145);
}
.task-card-done::before {
  background: oklch(0.65 0.16 145);
  opacity: 0.85;
}
.task-card-locked {
  border-style: dashed;
  border-color: oklch(0.78 0.10 145);
}

/* 层级缩进：子任务卡片相对父任务卡片缩进 95px
 * 子任务渲染在父卡片 body 内（有 --body-indent 内缩），抵消后留出 95px 缩进 */
.task-card {
  --body-indent: calc(14px + 16px + 8px + 22px + 8px + 24px + 8px);
}
.task-card-depth-1,
.task-card-depth-2,
.task-card-depth-3 {
  margin-left: calc(95px - var(--body-indent));
}

/* 拖拽手柄 */
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 22px;
  color: oklch(0.65 0.02 80);
  cursor: grab;
  opacity: 0.45;
  transition: opacity 0.15s, color 0.15s;
  border-radius: 4px;
}
.drag-handle:hover { opacity: 1; color: oklch(0.45 0.05 80); background: oklch(0.92 0.03 85); }
.drag-handle:active { cursor: grabbing; }
.drag-handle-disabled { cursor: default; opacity: 0.2; }

@keyframes task-card-flash {
  0%   { box-shadow: 0 0 0 0 oklch(0.78 0.16 75 / 0.55), 0 1px 2px rgba(0,0,0,0.04); }
  50%  { box-shadow: 0 0 0 6px oklch(0.78 0.16 75 / 0.25), 0 1px 2px rgba(0,0,0,0.04); }
  100% { box-shadow: 0 0 0 0 oklch(0.78 0.16 75 / 0), 0 1px 2px rgba(0,0,0,0.04); }
}
.task-card-flash { animation: task-card-flash 1.5s ease-out; }

/* header */
.task-card-header {
  display: grid;
  grid-template-columns: 16px auto 24px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 14px;
  cursor: pointer;
  user-select: none;
}

.status-btn {
  width: 22px;
  height: 22px;
  border: 1.5px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
  background: oklch(0.99 0.01 85);
  color: oklch(0.55 0.04 80);
  border-color: oklch(0.78 0.04 85);
}
.status-btn-sm { width: 18px; height: 18px; font-size: 10px; }
.status-btn svg { display: block; }
.status-btn-complete:hover {
  background: oklch(0.94 0.08 145);
  color: oklch(0.45 0.13 145);
  border-color: oklch(0.65 0.13 145);
  transform: scale(1.08);
}
.status-btn-activate {
  background: oklch(0.65 0.16 145);
  color: #fff;
  border-color: oklch(0.55 0.16 145);
  box-shadow: 0 1px 3px oklch(0.50 0.14 145 / 0.35);
}
.status-btn-activate:hover {
  background: oklch(0.58 0.16 145);
  border-color: oklch(0.48 0.16 145);
  box-shadow: 0 2px 6px oklch(0.50 0.14 145 / 0.45);
  transform: scale(1.08);
}

.icon-btn {
  width: 22px;
  height: 22px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: oklch(0.45 0.08 80);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.icon-btn svg { display: block; }
.icon-btn:hover {
  background: oklch(0.94 0.06 85);
  color: oklch(0.35 0.10 80);
  border-color: oklch(0.85 0.08 85);
}
.icon-btn-danger:hover {
  background: oklch(0.93 0.10 30 / 0.45);
  color: oklch(0.45 0.18 30);
  border-color: oklch(0.72 0.10 30);
}

.task-idx {
  color: oklch(0.55 0.04 75);
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  text-align: right;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.task-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.task-name {
  font-size: 15px;
  font-weight: 500;
  color: oklch(0.30 0.04 80);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.task-done {
  text-decoration: line-through;
  text-decoration-color: oklch(0.60 0.06 80);
  text-decoration-thickness: 1.5px;
  color: oklch(0.55 0.04 80);
}

.task-card-actions {
  display: flex;
  gap: 2px;
  opacity: 1;
}

.task-card-body {
  padding: 0 12px 10px var(--body-indent);
  animation: slideDown 0.2s ease-out;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.task-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: oklch(0.40 0.04 80);
  line-height: 1.6;
  padding: 8px 10px;
  background: oklch(0.97 0.02 85);
  border-left: 3px solid oklch(0.85 0.06 85);
  border-radius: 0 4px 4px 0;
  word-break: break-word;
}
.task-desc-empty {
  color: var(--text-tertiary);
  font-style: italic;
  background: transparent;
  border-left-color: oklch(0.90 0.02 85);
}

/* 成员 + 起止日期 */
.task-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 8px;
  padding: 0 2px;
}
.task-meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: oklch(0.94 0.04 75);
  color: oklch(0.40 0.06 75);
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid oklch(0.88 0.04 75);
}
.task-meta-chip-person {
  background: oklch(0.93 0.06 240 / 0.35);
  color: oklch(0.35 0.10 240);
  border-color: oklch(0.85 0.06 240);
}
.task-card-done .task-meta-chip {
  background: oklch(0.92 0.05 145);
  color: oklch(0.35 0.08 145);
  border-color: oklch(0.78 0.10 145);
}
.task-card-done .task-meta-chip-person {
  background: oklch(0.90 0.06 145);
  color: oklch(0.30 0.10 145);
  border-color: oklch(0.75 0.10 145);
}

.task-card-done .task-desc {
  background: oklch(0.92 0.05 145);
  color: oklch(0.35 0.08 145);
  border-left-color: oklch(0.75 0.12 145);
}

.annot-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  background: oklch(0.93 0.10 85);
  color: oklch(0.35 0.12 75);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid oklch(0.85 0.08 80);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  white-space: nowrap;
  box-shadow: 0 1px 2px oklch(0.5 0.06 80 / 0.10);
}
.annot-badge .annot-seg {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.annot-badge .annot-seg-ok {
  color: oklch(0.50 0.14 150);
}
.annot-badge .annot-seg-pending {
  color: oklch(0.62 0.15 80);
}
.annot-badge:hover {
  background: oklch(0.90 0.12 85);
  border-color: oklch(0.65 0.13 80);
  transform: translateY(-1px);
}
/* 全部已确认：胶囊整体变绿背景（有未确认时保持黄色系） */
.annot-badge.annot-all-done {
  background: oklch(0.90 0.10 145);
  border-color: oklch(0.78 0.10 145);
}
.annot-badge.annot-all-done .annot-seg-ok {
  color: oklch(0.40 0.12 150);
}
.annot-badge.annot-all-done:hover {
  background: oklch(0.87 0.11 145);
  border-color: oklch(0.68 0.12 145);
}

.file-refs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  align-items: center;
}
.file-refs-row-label {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-right: 4px;
}
.file-ref-link {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: oklch(0.94 0.04 75);
  color: oklch(0.40 0.06 75);
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid oklch(0.88 0.04 75);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.file-ref-link:hover {
  background: oklch(0.91 0.06 75);
  color: oklch(0.35 0.10 75);
  border-color: oklch(0.78 0.06 75);
}

/* 子任务列表 */
.subtask-list {
  border-top: 1px dashed oklch(0.85 0.05 85);
  padding-top: 8px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.subtask-ghost {
  opacity: 0.5;
  background: oklch(0.82 0.10 240);
  border: 1px dashed oklch(0.60 0.15 240);
  border-radius: 4px;
}

/* 搜索关键字高亮 */
.task-card :deep(.hl),
.task-card .hl {
  background: #fef08a;
  color: #78350f;
  font-weight: 700;
  padding: 0 2px;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

@keyframes subtask-flash {
  0%   { box-shadow: 0 0 0 0 oklch(0.70 0.14 240 / 0.55); }
  50%  { box-shadow: 0 0 0 4px oklch(0.70 0.14 240 / 0.30); }
  100% { box-shadow: 0 0 0 0 oklch(0.70 0.14 240 / 0); }
}
.subtask-flash { animation: subtask-flash 1.5s ease-out; }
</style>