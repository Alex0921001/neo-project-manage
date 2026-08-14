<template>
  <!-- 任务卡：支持任意层级（顶层 / 子任务 / 孙任务）
       - depth=0：顶层任务（在 TaskTab 的 vuedraggable 里）
       - depth=1：子任务（在父 TaskCard 的 vuedraggable 里，支持拖拽排序）
       - depth=2+：孙任务（不拖拽，仅展示 + 增删改）-->
  <div
    :class="[
      'task-card',
      `task-card-depth-${depth}`,
      { 'task-card-done': task.done, 'task-card-flash': flashing }
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
        <span v-if="task.priority" class="priority-badge" :class="`priority-${task.priority.toLowerCase()}`">{{ task.priority }}</span>
        <button
          class="milestone-flag-btn"
          :class="{ active: task.isMilestone }"
          :title="task.isMilestone ? '取消里程碑' : '标记为里程碑'"
          @click.stop="$emit('toggle-milestone', task)"
        >
          <svg v-if="!task.isMilestone" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </button>
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
        <button class="icon-btn" title="复制搜索语句" @click.stop="copyTask">
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
      <!-- v1.3.1：depth 0 无子任务时也渲染空 draggable 放置区，支持从其他任务拖入子任务 -->
      <draggable
        v-if="draggable_drag && !searchQuery"
        :list="subtasksLocal"
        item-key="id"
        handle=".drag-handle"
        ghost-class="subtask-ghost"
        :animation="180"
        group="tasks"
        :class="['subtask-list', { 'subtask-empty': !(task.subtasks || []).length }]"
        @end="onSubtaskDragEnd"
      >
        <template #item="{ element: s }">
          <TaskCard
            :task="s"
            :files="files"
            :search-query="searchQuery"
            :project-id="projectId"
            :expand-all="expandAll"
            :force-expand-ids="forceExpandIds"
            :depth="depth + 1"
            @mark-task-done="$emit('mark-task-done', $event)"
            @edit="$emit('edit-subtask', task, s)"
            @edit-subtask="$emit('edit-subtask', $event)"
            @subtask="$emit('subtask', $event)"
            @delete="$emit('delete-task-deep', s.id)"
            @delete-task-deep="$emit('delete-task-deep', $event)"
            @toggle-milestone="$emit('toggle-milestone', $event)"
            @select-annotation="$emit('select-annotation', $event)"
            @changed="$emit('changed')"
          />
        </template>
        <template v-if="!(task.subtasks || []).length" #footer>
          <div class="subtask-drop-hint">拖入任务可添加为子任务</div>
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
          :force-expand-ids="forceExpandIds"
          :depth="depth + 1"
          @mark-task-done="$emit('mark-task-done', $event)"
          @edit="$emit('edit-subtask', task, s)"
          @edit-subtask="$emit('edit-subtask', $event)"
          @subtask="$emit('subtask', $event)"
          @delete="$emit('delete-task-deep', s.id)"
          @delete-task-deep="$emit('delete-task-deep', $event)"
          @toggle-milestone="$emit('toggle-milestone', $event)"
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
  forceExpandIds: { type: Array, default: () => [] }, // 定位跳转：命中任务 id 强制展开（祖先链）
  depth: { type: Number, default: 0 },        // 0=顶层，1=子任务，2=孙任务
  dragDisabled: { type: Boolean, default: false }, // V2.1.2 非默认排序时禁用拖拽（隐藏把手）
});
const emit = defineEmits([
  "mark-task-done",
  "edit",
  "edit-subtask",
  "subtask",
  "delete",
  "delete-task-deep",
  "toggle-milestone",
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

// 定位跳转（概览/里程碑→批注）：目标任务或祖先在 forceExpandIds 中 → 强制展开
watch(
  () => props.forceExpandIds,
  (ids) => {
    if (ids?.includes(props.task.id)) expanded.value = true;
  },
  { immediate: true }
);

// 搜索状态下强制展开（已完成任务默认折叠，搜索时看不到命中位置）
// 清空搜索后恢复默认：未完成展开、已完成折叠
watch(() => props.searchQuery, (q) => {
  if (q && q.trim()) expanded.value = true;
  else expanded.value = !props.task.done;
});

// 仅顶层卡片（depth 0）渲染子任务时支持拖拽；depth>=1 渲染后代用普通列表（嵌套 draggable 不稳）
// V2.1.2：非默认排序（dragDisabled）时同样禁用
const draggable_drag = computed(() => props.depth < 1 && !props.dragDisabled);

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
    silent: true,
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
  const res = await api(`api/open-file?path=${encodeURIComponent(f.path)}`, { silent: true });
  if (!res?.ok) toast(res?.error || "打开文件失败", "error");
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
  copyText(`使用项目管理插件工具搜索：【任务 id:${props.task.id}】 【${props.task.name || ""}】 的具体内容。`);
}

// 递归子节点标记完成 / 激活（直接 emit mark-task-done，由 TaskTab 统一处理）

// 暴露闪烁 API（外部可调用，让新建的任务闪烁）
defineExpose({
  flash() { flashing.value = true; setTimeout(() => flashing.value = false, 1500); }
});
</script>

<style scoped>
/* ===== 基础：黑白灰卡片 ===== */
.task-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
  overflow: hidden;
}
.task-card:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-md);
}

/* 已完成：保持白底，状态由勾选按钮与划线表达 */
.task-card-done {
  background: var(--bg-card);
  border-color: var(--border-light);
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
  color: var(--text-tertiary);
  cursor: grab;
  opacity: 0.45;
  transition: opacity 0.15s, color 0.15s;
  border-radius: 4px;
}
.drag-handle:hover { opacity: 1; color: var(--text-secondary); background: var(--bg-hover); }
.drag-handle:active { cursor: grabbing; }
.drag-handle-disabled { cursor: default; opacity: 0.2; }

@keyframes task-card-flash {
  0%   { box-shadow: 0 0 0 0 var(--accent-warm), var(--shadow-sm); }
  50%  { box-shadow: 0 0 0 5px var(--accent-warm-subtle), var(--shadow-sm); }
  100% { box-shadow: 0 0 0 0 var(--accent-warm-subtle), var(--shadow-sm); }
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
  background: var(--bg-card);
  color: var(--text-tertiary);
  border-color: var(--border-light);
}
.status-btn-sm { width: 18px; height: 18px; font-size: 10px; }
.status-btn svg { display: block; }
.status-btn-complete:hover {
  background: var(--bg-hover);
  color: var(--status-done-text);
  border-color: var(--status-done-text);
}
.status-btn-activate {
  background: transparent;
  color: var(--status-done-text);
  border-color: var(--status-done-text);
}
.status-btn-activate:hover {
  background: var(--status-done-text);
  color: var(--text);
  border-color: var(--status-done-text);
}

.icon-btn {
  width: 22px;
  height: 22px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
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
  background: var(--bg-hover);
  color: var(--text-secondary);
  border-color: var(--border-light);
}
.icon-btn-danger:hover {
  background: var(--bg-hover);
  color: var(--danger);
  border-color: var(--danger);
}

.task-idx {
  color: var(--text-tertiary);
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
/* 优先级等级标签：P0 深红（最急）→ P5 浅灰（最缓），低饱和点缀，不抢任务名 */
.priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.03em;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  user-select: none;
}
.priority-p0 { color: #b3261e; background: rgba(179, 38, 30, 0.12); border: 1px solid rgba(179, 38, 30, 0.28); }
.priority-p1 { color: #c0392b; background: rgba(192, 57, 43, 0.10); border: 1px solid rgba(192, 57, 43, 0.24); }
.priority-p2 { color: #b9791f; background: rgba(185, 121, 31, 0.10); border: 1px solid rgba(185, 121, 31, 0.24); }
.priority-p3 { color: var(--text-tertiary); background: var(--bg); border: 1px solid var(--border-light); }
.priority-p4 { color: #5a7f9c; background: rgba(90, 127, 156, 0.10); border: 1px solid rgba(90, 127, 156, 0.24); }
.priority-p5 { color: #98a0ab; background: transparent; border: 1px solid var(--border-light); opacity: 0.8; }
.task-card-done .priority-badge { opacity: 0.55; }
/* 里程碑旗帜按钮：默认空心灰，标记后实心红 */
.milestone-flag-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.milestone-flag-btn svg { display: block; }
.milestone-flag-btn:hover {
  background: var(--bg-hover);
  color: #e5484d;
}
.milestone-flag-btn.active {
  color: #e5484d;
}
.milestone-flag-btn.active:hover {
  background: rgba(229, 72, 77, 0.1);
}
.task-card-done .milestone-flag-btn { opacity: 0.55; }
.task-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.task-done {
  text-decoration: line-through;
  text-decoration-color: var(--border);
  text-decoration-thickness: 1.5px;
  color: var(--text-tertiary);
}

.task-card-actions {
  display: flex;
  gap: 2px;
  opacity: 1;
}

.task-card-body {
  padding: 0 12px 10px var(--body-indent);
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.task-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 8px 10px;
  background: oklch(0.95 0.10 90 / 0.45);
  border-left: 3px solid var(--accent-warm);
  border-radius: 0 4px 4px 0;
  word-break: break-word;
}
.task-desc-empty {
  color: var(--text-tertiary);
  font-style: italic;
  background: oklch(0.95 0.10 90 / 0.45);  /* v1.3.1：无描述也染色，未完成为黄色 */
  border-left-color: var(--accent-warm);
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
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
}
.task-meta-chip-person {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border-color: var(--border-light);
}
.task-card-done .task-meta-chip {
  background: var(--bg);
  color: var(--text-secondary);
  border-color: var(--border-light);
}
.task-card-done .task-meta-chip-person {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border-color: var(--border-light);
}

.task-card-done .task-desc {
  background: oklch(0.93 0.10 145 / 0.45);
  color: var(--text-secondary);
  border-left-color: var(--status-done-text);
}

.annot-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}
.annot-badge .annot-seg {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.annot-badge .annot-seg-ok {
  color: var(--status-done-text);
}
.annot-badge .annot-seg-pending {
  color: var(--status-todo-text);
}
.annot-badge:hover {
  background: var(--bg-hover);
  border-color: var(--border);
}
.annot-badge.annot-all-done {
  background: transparent;
  border-color: var(--border-light);
}
.annot-badge.annot-all-done .annot-seg-ok {
  color: var(--status-done-text);
}
.annot-badge.annot-all-done:hover {
  background: var(--bg-hover);
  border-color: var(--border);
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
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.file-ref-link:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border);
}

/* 子任务列表 */
.subtask-list {
  border-top: 1px solid var(--border-light);
  padding-top: 8px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* v1.3.1：空子任务放置区（拖入任务成为子任务） */
.subtask-empty {
  min-height: 24px;
  border-top: 1px dashed transparent;
  justify-content: center;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.subtask-empty:hover {
  border-top-color: var(--border);
}
.subtask-drop-hint {
  display: none;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-tertiary);
  border: 1px dashed var(--border);
  border-radius: 4px;
  text-align: center;
}
.subtask-empty:hover .subtask-drop-hint,
.subtask-empty.sortable-chosen .subtask-drop-hint {
  display: block;
}
.subtask-ghost {
  opacity: 0.55;
  background: transparent;
  border: 1px dashed var(--status-doing-text);
  border-radius: 4px;
}

/* 搜索关键字高亮：浅琥珀底 + 深琥珀字 */
.task-card :deep(.hl),
.task-card .hl {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  font-weight: 700;
  padding: 0 2px;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

@keyframes subtask-flash {
  0%   { box-shadow: 0 0 0 0 var(--accent-warm); }
  50%  { box-shadow: 0 0 0 4px var(--accent-warm-subtle); }
  100% { box-shadow: 0 0 0 0 var(--accent-warm-subtle); }
}
.subtask-flash { animation: subtask-flash 1.5s ease-out; }
</style>