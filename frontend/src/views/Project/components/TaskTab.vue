<template>
  <div class="area-section">
    <!-- 任务新建/编辑弹窗（el-dialog + el-form） -->
    <el-dialog
      v-model="dialogShow"
      :title="dialogTitle"
      width="800px"
      class="task-dialog-el"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <!-- 第一行：名称 -->
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="任务名称" maxlength="50" show-word-limit />
        </el-form-item>

        <!-- 第二行：起止日期 + 优先级 + 成员 -->
        <div class="task-form-row">
          <el-form-item label="起止日期">
            <el-date-picker
              v-model="dateRangeVal"
              type="daterange"
              value-format="YYYY-MM-DD"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              :disabled-date="disabledTaskDate"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="form.priority" style="width: 100%">
              <el-option v-for="p in priorityOptions" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="是否里程碑">
            <el-select v-model="form.isMilestone" style="width: 100%">
              <el-option v-for="o in milestoneOptions" :key="String(o.value)" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="成员">
            <MemberSelect
              v-model="form.assignees"
              :restrict-to="members"
              placeholder="未分配"
              clearable
            />
          </el-form-item>
        </div>

        <!-- 第三行：关联文件 -->
        <el-form-item label="关联文件">
          <el-select
            v-model="form.fileRefs"
            multiple
            :disabled="!files || !files.length"
            :placeholder="(files && files.length) ? '请选择关联文件' : '项目暂无文件，请先到文件页上传'"
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
          >
            <el-option v-for="f in files" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>

        <!-- 第四行：简述 -->
        <el-form-item label="简述">
          <RichEditor v-model="form.description" :project-id="projectId" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogShow = false">取消</el-button>
        <el-button class="btn-save" :loading="saving" @click="submitInline">{{ isEditMode ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 列表模式：左侧任务列表 + 右侧便利贴 -->
    <div class="task-tab-layout" ref="layoutRef">
      <!-- 跨容器引导线 SVG：从选中任务/子任务指向便利贴面板 -->
      <svg
        class="connector-svg"
        :viewBox="connectorViewBox"
        preserveAspectRatio="none"
        v-show="connectorPath"
        aria-hidden="true"
      >
        <path :d="connectorPath" class="connector-path" />
        <circle :cx="connectorStart.x" :cy="connectorStart.y" r="3.5" class="connector-dot-start" />
        <circle :cx="connectorEnd.x" :cy="connectorEnd.y" r="5" class="connector-dot-end" />
        <circle :cx="connectorEnd.x" :cy="connectorEnd.y" r="2" class="connector-dot-end-inner" />
      </svg>

      <div class="task-tab-list">
        <!-- 里程碑步骤图：有里程碑节点才渲染（避免空容器显示灰色条） -->
        <div v-if="hasMilestones" class="task-tab-milestone-area">
          <MilestoneTimeline
            :plan-start="planStart"
            :plan-end="planEnd"
            :tasks="tasks"
            @jump-task="(taskId) => scrollToTaskById(taskId)"
            @jump-annotation="({ taskId, annotationId }) => scrollToAnnotation(taskId, annotationId)"
          />
        </div>
        <div v-if="!tasks.length" class="tasks-empty">
          <div class="tasks-empty-deco">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <p class="tasks-empty-title">还没有任务</p>
          <p class="tasks-empty-sub">拆解项目，规划可执行的任务</p>
          <button class="tasks-empty-add" @click="openAdd">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>添加第一个任务</span>
          </button>
        </div>
        <template v-else>
<div v-if="displayedUndoneTasks.length" class="task-group">
            <div class="task-group-header">
              <span class="task-group-title">未完成</span>
              <span class="task-group-count">{{ displayedUndoneTasks.length }}</span>
            </div>
            <draggable
              :list="dragUndoneList"
              item-key="id"
              handle=".drag-handle"
              ghost-class="task-ghost"
              chosen-class="task-chosen"
              drag-class="task-drag"
              animation="200"
              group="tasks"
              :disabled="!!searchQuery"
              class="task-drag-area"
              @end="onTopDragEnd"
            >
              <template #item="{ element: t }">
                <TaskCard
                  :task="t"
                  :files="files"
                  :search-query="searchQuery"
                  :project-id="projectId"
                  :expand-all="expandAll"
                  :force-expand-ids="forceExpandIds"
                  @mark-task-done="markTaskDone"
                  @edit="startEdit"
                  @subtask="startSubtask"
                  @toggle-milestone="toggleMilestone"
                  @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
                  @delete-task-deep="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
                  @edit-subtask="startEditSubtask"
                  @select-annotation="onSelectAnnotation"
                  @changed="$emit('changed')"
                />
              </template>
            </draggable>
          </div>
          <div v-if="displayedDoneTasks.length" class="task-group task-group-done">
            <div class="task-group-header">
              <span class="task-group-title">已完成</span>
              <span class="task-group-count">{{ displayedDoneTasks.length }}</span>
            </div>
            <draggable
              :list="dragDoneList"
              item-key="id"
              handle=".drag-handle"
              ghost-class="task-ghost"
              chosen-class="task-chosen"
              drag-class="task-drag"
              animation="200"
              :disabled="!!searchQuery"
              class="task-drag-area"
              @end="onTopDragEnd"
            >
              <template #item="{ element: t }">
                <TaskCard
                  :task="t"
                  :files="files"
                  :search-query="searchQuery"
                  :project-id="projectId"
                  :expand-all="expandAll"
                  :force-expand-ids="forceExpandIds"
                  @mark-task-done="markTaskDone"
                  @edit="startEdit"
              @subtask="startSubtask"
              @toggle-milestone="toggleMilestone"
              @delete="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
              @delete-task-deep="(id) => $emit('confirm-ask', { message: '确认删除此任务？', action: 'delete-task', payload: id })"
              @edit-subtask="startEditSubtask"
              @select-annotation="onSelectAnnotation"
              @changed="$emit('changed')"
            />
              </template>
            </draggable>
          </div>
        </template>
      </div>
      <aside v-if="activeTaskId" class="task-tab-annot">
        <AnnotationPanel
          :project-id="projectId"
          :task="activeTarget"
          :tasks="tasks"
          @changed="() => emit('changed')"
          @close="closeAnnotation"
        />
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import draggable from "vuedraggable";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import TaskCard from "./TaskCard.vue";
import MilestoneTimeline from "./MilestoneTimeline.vue";
import AnnotationPanel from "./AnnotationPanel.vue";
import MemberSelect from "../../../components/MemberSelect.vue";
import { normalizeRichText } from "../../../utils/text.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";
// 富文本编辑器异步加载（Tiptap 体积大，拆独立 chunk，含 loading/error/重试）
const RichEditor = createRichEditor();

const props = defineProps({
  projectId: String,
  tasks: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] },
  planStart: { type: String, default: "" },
  planEnd: { type: String, default: "" },
  searchQuery: { type: String, default: "" },
  expandAll: { type: Boolean, default: null },
});
const emit = defineEmits(["changed", "confirm-ask"]);

// ===== 当前选中的批注目标 =====
const activeTaskId = ref("");
const activeSubtaskId = ref("");
// 定位跳转：目标批注 id（传给批注面板高亮闪烁）+ 强制展开的祖先链任务 id
const highlightAnnId = ref("");
const forceExpandIds = ref([]);

// 递归找任务节点所在路径（顶层→目标，含自身），供祖先链强制展开
function findTaskPath(tasks, targetId, trail = []) {
  for (const t of tasks || []) {
    if (t.id === targetId) return [...trail, t.id];
    const hit = findTaskPath(t.subtasks, targetId, [...trail, t.id]);
    if (hit) return hit;
  }
  return null;
}

// 递归查找任意层级的 task（按 id 匹配）
function findTaskInTree(tasks, id) {
  for (const t of tasks || []) {
    if (t.id === id) return t;
    const sub = findTaskInTree(t.subtasks, id);
    if (sub) return sub;
  }
  return null;
}

// 顶层任务 id（用于引导线定位）
const activeTask = computed(() => findTaskInTree(props.tasks, activeTaskId.value));
// 任意层级的目标 task（用于批注面板）
const activeTarget = computed(() => {
  if (!activeSubtaskId.value) return activeTask.value;
  return findTaskInTree(props.tasks, activeSubtaskId.value) || activeTask.value;
});

// 定位批注：展开祖先链 → 打开批注面板 → 滚动到任务 → 批注卡片闪烁（概览/里程碑点击批注入口）
function scrollToAnnotation(taskId, annotationId) {
  if (!taskId || !annotationId) return;
  // 1. 祖先链强制展开（目标可能是折叠父任务的子任务）
  const path = findTaskPath(props.tasks, taskId);
  if (path) forceExpandIds.value = path;
  // 2. 打开该任务的批注面板
  activeTaskId.value = taskId;
  activeSubtaskId.value = "";
  // 3. 刷新数据（批注确认态归位）+ 滚动任务卡
  emit("changed");
  highlightAnnId.value = annotationId;
  nextTick(() => scrollToTaskById(taskId));
  // 4. 2 秒后清除高亮标记（避免下次打开面板重复闪烁）
  setTimeout(() => { highlightAnnId.value = ""; }, 2500);
}

function onSelectAnnotation({ taskId, subtaskId }) {
  // 📌 / 📝 点击只展开便利贴面板，不负责关闭
  activeTaskId.value = taskId;
  activeSubtaskId.value = subtaskId || "";
  // 打开面板时刷新一次数据：批注本地确认标记在此归位并按确认状态重排
  emit("changed");
}
function closeAnnotation() {
  activeTaskId.value = "";
  activeSubtaskId.value = "";
}

// ===== 面板定位 + 引导线 =====
// 逻辑：选中任务后只初算一次，不跟滚动。
// 面板 align 到任务卡中心，不越上下边界。
// SVG 从任务卡右边缘连线到面板左边缘，两端用圆点标明链接点。
// 任务卡被删除/折叠（链接点消失）→ 自动关闭面板。
const layoutRef = ref(null);
const connectorPath = ref("");
const connectorStart = ref({ x: 0, y: 0 });
const connectorEnd = ref({ x: 0, y: 0 });
const connectorViewBox = ref("0 0 0 0");

let connectorPending = false;
let taskWatcherObserver = null;

function positionAndConnect() {
  if (!activeTaskId.value || !layoutRef.value) {
    connectorPath.value = "";
    return;
  }
  if (connectorPending) return;
  connectorPending = true;
  requestAnimationFrame(() => {
    connectorPending = false;
    const layout = layoutRef.value;
    if (!layout) { connectorPath.value = ""; return; }

    // 找到目标链接点（TaskCard 递归后所有 task 都用 task-${id}）
    const targetId = activeSubtaskId.value || activeTaskId.value;
    const targetEl = layout.querySelector(`[data-connector-id="task-${targetId}"]`);
    // 链接点不存在 → 关闭面板
    if (!targetEl) { closeAnnotation(); return; }

    const panel = layout.querySelector(".task-tab-annot");
    if (!panel) { connectorPath.value = ""; return; }

    const tRect = targetEl.getBoundingClientRect();
    const pRect = panel.getBoundingClientRect();
    const lRect = layout.getBoundingClientRect();

    // —— 面板定位 ——
    // 面板中心对齐任务卡垂直中心，不超出上下边距
    const panelHeight = pRect.height;
    const layoutHeight = lRect.height;
    const taskCenterY = tRect.top + tRect.height / 2 - lRect.top;
    const idealTop = taskCenterY - panelHeight / 2;
    const marginTop = Math.max(4, Math.min(Math.round(idealTop), layoutHeight - panelHeight - 4));
    panel.style.marginTop = `${marginTop}px`;

    // —— 引导线 ——
    // 重新获取面板 post-margin 的位置
    const pRect2 = panel.getBoundingClientRect();
    const panelCenterY = pRect2.top + pRect2.height / 2 - lRect.top;

    // 链接点 1：任务卡右边缘中心
    const x1 = Math.round(tRect.right - lRect.left);
    const y1 = Math.round(taskCenterY);
    // 链接点 2：面板左边缘中心
    const x2 = Math.round(pRect2.left - lRect.left);
    const y2 = Math.round(panelCenterY);

    connectorStart.value = { x: x1, y: y1 };
    connectorEnd.value = { x: x2, y: y2 };

    // 微曲线，更自然
    const dx = x2 - x1;
    connectorPath.value = `M ${x1} ${y1} C ${x1 + dx * 0.4} ${y1}, ${x2 - dx * 0.4} ${y2}, ${x2} ${y2}`;
    connectorViewBox.value = `0 0 ${lRect.width} ${lRect.height}`;
  });
}

// 选中任务变化 → 等面板挂载后初算
watch([activeTaskId, activeSubtaskId], () => {
  if (activeTaskId.value) {
    nextTick(() => positionAndConnect());
    startTaskWatcher();
  } else {
    stopTaskWatcher();
    connectorPath.value = "";
  }
});

// 监听目标链接点是否存在（删除/折叠时清理）
function startTaskWatcher() {
  stopTaskWatcher();
  const list = layoutRef.value?.querySelector(".task-tab-list");
  if (!list || !activeTaskId.value) return;
  const targetId = activeSubtaskId.value || activeTaskId.value;
  const sel = `[data-connector-id="task-${targetId}"]`;
  taskWatcherObserver = new MutationObserver(() => {
    if (!list.querySelector(sel)) closeAnnotation();
  });
  taskWatcherObserver.observe(list, { childList: true, subtree: true });
}
function stopTaskWatcher() {
  if (taskWatcherObserver) { taskWatcherObserver.disconnect(); taskWatcherObserver = null; }
}

// resize 时重算（不跟滚动，只窗口缩放时）
let resizeObserver = null;
onMounted(() => {
  if (layoutRef.value && "ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      if (activeTaskId.value) positionAndConnect();
    });
    resizeObserver.observe(layoutRef.value);
  }
  // 初始已有选中时初算
  if (activeTaskId.value) {
    nextTick(() => positionAndConnect());
    startTaskWatcher();
  }
});
onUnmounted(() => {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  stopTaskWatcher();
});

// ===== 任务分组：未完成 / 已完成，组内按数组顺序（拖拽后保持） =====

// localTasks：与 props.tasks 镜像，拖拽时修改这里
const localTasks = ref([...(props.tasks || [])]);
watch(() => props.tasks, (v) => {
  localTasks.value = [...(v || [])];
}, { immediate: false });

// 拆成两个内部数组供 vuedraggable 直接 :list 绑定
const undoneArr = ref([]);
const doneArr = ref([]);

function syncSplit() {
  const u = [];
  const d = [];
  for (const t of localTasks.value) {
    if (t.done) d.push(t);
    else u.push(t);
  }
  undoneArr.value = u;
  doneArr.value = d;
}

watch(localTasks, () => syncSplit(), { immediate: true });

// 拖拽后从拆分数组重建完整顺序，持久化
function mergeAfterDrag() {
  const full = [...undoneArr.value, ...doneArr.value];
  localTasks.value = full;
  scheduleSave(full.map(t => t.id));
}

/**
 * 顶层拖拽结束：同级排序走 mergeAfterDrag；跨容器（变更父级）走 move API
 */
async function onTopDragEnd(event) {
  if (event.from !== event.to) {
    await handleCrossMove(event);
    return;
  }
  mergeAfterDrag();
}

/**
 * 跨容器落点：根据目标容器计算新父级（.task-drag-area=顶层，.subtask-list=所属任务），
 * 调 move API 持久化；失败时前端数据已变，刷新即回滚
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

// 顶层 display computed（传入搜索过滤）
const undoneTasks = computed(() => undoneArr.value);
const doneTasks = computed(() => doneArr.value);

let saveTimer = null;
function scheduleSave(taskIds) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    console.log("[neo-pm] saving reorder, taskIds:", JSON.stringify(taskIds));
    const res = await api(`api/projects/${props.projectId}/reorder-tasks`, {
      method: "POST",
      body: JSON.stringify({ taskIds }),
    });
    console.log("[neo-pm] reorder response:", res);
    if (!res?.ok) {
      console.error("[reorder-tasks] failed:", res);
      toast(`排序保存失败：${res?.error || "未知错误"}`, "error");
      emit("changed"); // 让父级重拉回滚
    } else {
      emit("changed"); // 保存成功，刷新数据保证同步
    }
  }, 500);
}

// 搜索时：父任务自身命中则保留全部子任务；只子任务命中则只保留命中项
// 搜索过滤（递归）：自身标题/描述命中保留全部后代；否则后代命中则保留命中路径；都不命中返回 null
function filterTaskForSearch(t, qLower) {
  if (!qLower) return t;
  const selfHit = (t.name || "").toLowerCase().includes(qLower)
               || (t.description || "").toLowerCase().includes(qLower);
  if (selfHit) return t;
  const filteredSubs = (t.subtasks || [])
    .map(s => filterTaskForSearch(s, qLower))
    .filter(Boolean);
  if (!filteredSubs.length) return null;
  return { ...t, subtasks: filteredSubs };
}
const searchLower = computed(() => props.searchQuery.trim().toLowerCase());
const displayedUndoneTasks = computed(() =>
  searchLower.value
    ? undoneTasks.value.map(t => filterTaskForSearch(t, searchLower.value)).filter(Boolean)
    : undoneTasks.value
);
const displayedDoneTasks = computed(() =>
  searchLower.value
    ? doneTasks.value.map(t => filterTaskForSearch(t, searchLower.value)).filter(Boolean)
    : doneTasks.value
);
// draggable 绑定列表：搜索态渲染过滤结果（拖拽已禁用，安全）；非搜索态用可变数组支持拖拽排序
const dragUndoneList = computed(() => (searchLower.value ? displayedUndoneTasks.value : undoneArr.value));
const dragDoneList = computed(() => (searchLower.value ? displayedDoneTasks.value : doneArr.value));

// 弹窗表单状态
const dialogShow = ref(false);
const saving = ref(false);
const editingId = ref(null);
const subtaskParent = ref(null);
const editingSubId = ref(null);
const form = reactive({ name: "", description: "", assignees: [], startDate: "", endDate: "", priority: "P3", isMilestone: false, fileRefs: [] });
const submitErr = ref(false);
const formRef = ref(null);

// ===== 起止日期 range（P1）：单个 daterange 绑定，同步到 form.startDate/endDate =====
const dateRangeVal = ref([]);
watch(dateRangeVal, (v) => {
  form.startDate = v?.[0] || "";
  form.endDate = v?.[1] || "";
});
function syncDateRangeFromForm() {
  dateRangeVal.value = form.startDate || form.endDate
    ? [form.startDate || null, form.endDate || null]
    : [];
}

// ===== 起止日期范围限制：限定在项目计划周期内（disabled-date，按本地时区整日比较）=====
function toLocalMidnight(str) {
  const [y, m, d] = String(str).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
function disabledTaskDate(date) {
  const t = date.getTime();
  // v1.3.1：子任务模式日期范围收紧到父任务（前端控制，后端不动）
  if (subtaskParent.value) {
    const ps = subtaskParent.value.startDate ? toLocalMidnight(subtaskParent.value.startDate) : -Infinity;
    const pe = subtaskParent.value.endDate ? toLocalMidnight(subtaskParent.value.endDate) : Infinity;
    return t < ps || t > pe;
  }
  // 顶层任务：项目计划周期
  const start = props.planStart ? toLocalMidnight(props.planStart) : -Infinity;
  const end = props.planEnd ? toLocalMidnight(props.planEnd) : Infinity;
  return t < start || t > end;
}

const isEditMode = computed(() => !!editingId.value || !!editingSubId.value);
// 优先级选项：P0 最急 → P5 最缓，默认 P3（与后端 normalizePriority 对齐）
const priorityOptions = ["P0", "P1", "P2", "P3", "P4", "P5"];
// 里程碑下拉选项（与优先级下拉风格一致）
const milestoneOptions = [
  { label: "否", value: false },
  { label: "是", value: true },
];
const dialogTitle = computed(() => {
  if (subtaskParent.value) return `子任务 · （父级任务：${subtaskParent.value.name}）`;
  if (isEditMode.value) return "编辑任务";
  return "新建任务";
});

const rules = {
  name: [
    { required: true, message: "请填写任务名称", trigger: "blur" },
    { min: 1, max: 50, message: "名称限 1-50 个字符", trigger: "blur" },
  ],
};

// 待滚动定位的标记：POST 后设值，watch 捕捉数据回流后清值并滚动
const pendingScroll = ref(null);  // { kind: 'task'|'subtask', id: string }
const totalSubtaskCount = computed(() =>
  props.tasks.reduce((sum, t) => sum + (t.subtasks?.length || 0), 0)
);

// ===== 打开方式 =====
function resetForm() {
  form.name = "";
  form.description = "";
  form.fileRefs = [];
  form.assignees = [];
  form.startDate = "";
  form.endDate = "";
  form.priority = "P3";
  form.isMilestone = false;
  submitErr.value = false;
}

function openAdd() {
  editingId.value = null;
  subtaskParent.value = null;
  editingSubId.value = null;
  resetForm();
  syncDateRangeFromForm();
  dialogShow.value = true;
}

function startEdit(t) {
  editingId.value = t.id;
  subtaskParent.value = null;
  editingSubId.value = null;
  form.name = t.name;
  form.description = t.description || "";
  form.fileRefs = [...(t.fileRefs || [])];
  form.assignees = Array.isArray(t.assignees) ? [...t.assignees] : [];
  form.startDate = t.startDate || "";
  form.endDate = t.endDate || "";
  form.priority = t.priority || "P3";
  form.isMilestone = !!t.isMilestone;
  submitErr.value = false;
  syncDateRangeFromForm();
  dialogShow.value = true;
}

function startSubtask(t) {
  editingId.value = null;
  subtaskParent.value = t;
  editingSubId.value = null;
  resetForm();
  syncDateRangeFromForm();
  dialogShow.value = true;
}

function startEditSubtask(task, sub) {
  editingId.value = null;
  subtaskParent.value = task;
  editingSubId.value = sub.id;
  form.name = sub.name;
  form.description = sub.description || "";
  form.fileRefs = [...(sub.fileRefs || [])];
  form.assignees = Array.isArray(sub.assignees) ? [...sub.assignees] : [];
  form.startDate = sub.startDate || "";
  form.endDate = sub.endDate || "";
  form.priority = sub.priority || "P3";
  form.isMilestone = !!sub.isMilestone;
  submitErr.value = false;
  syncDateRangeFromForm();
  dialogShow.value = true;
}

function closeInline() {
  dialogShow.value = false;
}

// ===== 提交 =====
function buildPayload() {
  return {
    name: form.name.trim(),
    description: normalizeRichText(form.description),
    fileRefs: form.fileRefs,
    assignees: form.assignees,
    startDate: form.startDate,
    endDate: form.endDate,
    priority: form.priority || "P3",
    isMilestone: form.isMilestone,
  };
}

async function submitInline() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  // 硬校验：结束日期不能早于开始日期
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    toast("结束日期不能早于开始日期", "error");
    return;
  }
  // 软提示：任务日期越出项目计划范围（四象限，与后端 validateTaskDates 对齐；不阻断提交）
  const warnList = [];
  if (props.planStart && form.startDate && form.startDate < props.planStart) {
    warnList.push(`任务开始日期 ${form.startDate} 早于项目计划开始日期 ${props.planStart}`);
  }
  if (props.planEnd && form.startDate && form.startDate > props.planEnd) {
    warnList.push(`任务开始日期 ${form.startDate} 晚于项目计划结束日期 ${props.planEnd}`);
  }
  if (props.planStart && form.endDate && form.endDate < props.planStart) {
    warnList.push(`任务结束日期 ${form.endDate} 早于项目计划开始日期 ${props.planStart}`);
  }
  if (props.planEnd && form.endDate && form.endDate > props.planEnd) {
    warnList.push(`任务结束日期 ${form.endDate} 晚于项目计划结束日期 ${props.planEnd}`);
  }
  if (warnList.length) toast(`提示：${warnList.join("；")}`, "warn");
  const payload = buildPayload();
  saving.value = true;
  // 透传后端 warnings（P3-3：后端四象限提示全量展示）
  const showWarnings = (res) => {
    if (res?.data?.warnings?.length) toast(`提示：${res.data.warnings.join("；")}`, "warn");
  };
  try {
    if (editingSubId.value) {
      // 子/孙任务 id 全局唯一，直接按任务 id 更新（后端已无 /tasks/:id/subtasks/:sid 子路由）
      const res = await api(`api/projects/${props.projectId}/tasks/${editingSubId.value}`, {
        method: "PUT", body: JSON.stringify(payload), silent: true,
      });
      if (res.ok) { showWarnings(res); toast("已更新"); closeInline(); load(); }
      else toast(res.error || "更新失败", "error");
    } else if (editingId.value) {
      const res = await api(`api/projects/${props.projectId}/tasks/${editingId.value}`, {
        method: "PUT", body: JSON.stringify(payload), silent: true,
      });
      if (res.ok) { showWarnings(res); toast("已更新"); closeInline(); load(); }
      else toast(res.error || "更新失败", "error");
    } else if (subtaskParent.value) {
      // 子任务 / 孙任务创建（统一路径：POST tasks + parentTaskId）
      const payloadWithParent = { ...payload, parentTaskId: subtaskParent.value.id };
      const res = await api(`api/projects/${props.projectId}/tasks`, {
        method: "POST", body: JSON.stringify(payloadWithParent), silent: true,
      });
      if (res.ok) {
        showWarnings(res);
        toast("子任务已创建");
        closeInline();
        const newId = res.data?.id;
        if (newId) pendingScroll.value = { kind: "subtask", id: newId };
        load();
      } else toast(res.error || "创建失败", "error");
    } else {
      const res = await api(`api/projects/${props.projectId}/tasks`, {
        method: "POST", body: JSON.stringify(payload), silent: true,
      });
      if (res.ok) {
        showWarnings(res);
        toast("已创建");
        closeInline();
        const newId = res.data?.id;
        if (newId) pendingScroll.value = { kind: "task", id: newId };
        load();
      } else toast(res.error || "创建失败", "error");
    }
  } finally {
    saving.value = false;
  }
}

function load() { emit("changed"); }

// 新建后滚动定位 + 高亮闪烁
function scrollToTask(taskId) {
  const root = layoutRef.value;
  if (!root) return;
  const el = root.querySelector(`[data-task-id="${taskId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("task-card-flash");
  setTimeout(() => el.classList.remove("task-card-flash"), 1500);
}

/**
 * 按任务 id 定位任意层级任务（顶层 / 子任务 / 孙任务），日历跳转使用
 * TaskCard 所有层级都有 data-task-id 与 data-connector-id="task-{id}"
 */
function scrollToTaskById(taskId) {
  const root = layoutRef.value;
  if (!root) return;
  const el =
    root.querySelector(`[data-task-id="${taskId}"]`) ||
    root.querySelector(`[data-connector-id="task-${taskId}"]`);
  if (!el) return;
  // 目标可能是子任务卡片：展开其所在层级（父卡片已展开才在 DOM 中）
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("task-card-flash");
  setTimeout(() => el.classList.remove("task-card-flash"), 1500);
}
function scrollToSubtask(subtaskId) {
  const root = layoutRef.value;
  if (!root) return;
  const el = root.querySelector(`[data-connector-id="sub-${subtaskId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("subtask-flash");
  setTimeout(() => el.classList.remove("subtask-flash"), 1500);
}

// 监听数据回流 → 滚动定位
watch(() => props.tasks.length, (newLen, oldLen) => {
  if (pendingScroll.value?.kind === "task" && newLen > (oldLen ?? 0)) {
    const id = pendingScroll.value.id;
    pendingScroll.value = null;
    nextTick(() => scrollToTask(id));
  }
});
watch(totalSubtaskCount, (newCount, oldCount) => {
  if (pendingScroll.value?.kind === "subtask" && newCount > (oldCount ?? 0)) {
    const id = pendingScroll.value.id;
    pendingScroll.value = null;
    nextTick(() => scrollToSubtask(id));
  }
});

/**
 * 递归统计未完成的后代任务数量（子 / 孙 / 任意层级）
 */
function countIncompleteDescendants(task) {
  let count = 0;
  const stack = [...(task.subtasks || [])];
  while (stack.length) {
    const s = stack.pop();
    if (!s.done) count++;
    for (const g of (s.subtasks || [])) stack.push(g);
  }
  return count;
}

/**
 * 统一标记任务完成 / 激活（适用任意层级）
 * 完成时校验：任务自身批注未确认、后代任务未完成 → 阻止
 * @param {{task: Object, done: boolean}} payload
 */
async function markTaskDone({ task, done }) {  if (!task) return;
  if (done) {
    const pendingAnns = (task.annotations || []).filter(a => !a.confirmed);
    if (pendingAnns.length) {
      toast(`无法完成任务：${pendingAnns.length} 条批注未确认`, "error");
      return;
    }
    const pendingDesc = countIncompleteDescendants(task);
    if (pendingDesc) {
      toast(`无法完成任务：${pendingDesc} 个子任务未完成`, "error");
      return;
    }
  } else {
    // v1.3.1：父任务仍为完成时不能激活子任务（未完成状态只能从父任务向下同步）
    if (task.parentTaskId) {
      const parent = findTaskInTree(props.tasks, task.parentTaskId);
      if (parent && parent.done) {
        toast(`无法激活子任务：父任务「${parent.name}」尚未激活，请先激活父任务`, "error");
        return;
      }
    }
  }
  const res = await api(`api/projects/${props.projectId}/tasks/${task.id}`, {
    method: "PUT",
    body: JSON.stringify({ done }),
    silent: true,  // 手动 toast 错误，避免与 api 拦截重复弹
  });
  if (res?.ok) {
    load();
  } else {
    toast(res?.error || "更新任务状态失败", "error");
  }
}

/**
 * 切换任务里程碑标记（旗帜按钮点击，双入口之一，与编辑表单一致）
 * 任意层级任务共用：直接按任务 id 更新
 */
async function toggleMilestone(task) {
  if (!task) return;
  const res = await api(`api/projects/${props.projectId}/tasks/${task.id}`, {
    method: "PUT",
    body: JSON.stringify({ isMilestone: !task.isMilestone }),
    silent: true,
  });
  if (res?.ok) {
    toast(task.isMilestone ? "已取消里程碑" : "已标记为里程碑");
    load();
  } else {
    toast(res?.error || "更新里程碑状态失败", "error");
  }
}

// 是否存在里程碑节点（isMilestone 任务 或 挂有 milestone 批注的任务）——决定是否渲染步骤条容器
const hasMilestones = computed(() => {
  const walk = (list) => {
    for (const t of list || []) {
      if (t.isMilestone || t.annotations?.some((a) => a.kind === "milestone")) return true;
      if (walk(t.subtasks)) return true;
    }
    return false;
  };
  return walk(props.tasks);
});

defineExpose({ openAdd, scrollToTaskById, scrollToAnnotation });</script>

<style scoped>
.area-section {
  display: flex; flex-direction: column;
  margin-bottom: 24px;
}

/* 任务弹窗：body 内边距加大（H） */
.task-dialog-el :deep(.el-dialog__body) {
  padding: 24px;
}

/* 任务弹窗：同行多列 */
.task-form-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.task-form-row .el-form-item {
  flex: 1;
  min-width: 0;
}
/* 起止日期占更多宽度（daterange 有最小输入宽度），优先级/成员均分剩余 */
.task-form-row .el-form-item:first-child {
  flex: 1.5;
  min-width: 280px;
}

.task-tab-layout {
  position: relative;
  display: flex; gap: 16px;
  align-items: flex-start;
}
.task-tab-list {
  position: relative;
  z-index: 1;
  flex: 1; min-width: 0;
  min-height: 200px;
  padding-right: 4px;
}

/* 里程碑步骤图容器：任务列表上方，底部留白与列表隔开 */
.task-tab-milestone-area {
  margin-bottom: 18px;
  padding: 14px 16px 10px;
  background: var(--bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

/* 空态：与备注对齐 */
.tasks-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  gap: 6px;
}
.tasks-empty-deco {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.tasks-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.tasks-empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.tasks-empty-add {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--text);
  border-radius: var(--radius-md);
  background: var(--text);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
  box-shadow: var(--shadow-sm);
}
.tasks-empty-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  box-shadow: var(--shadow-md);
}
.task-tab-annot {
  width: 320px; flex-shrink: 0;
  display: flex; flex-direction: column;
  align-self: flex-start;
  max-height: 100%;
  overflow: hidden;
}

/* 跨容器引导线 SVG：选中任务/子任务 → 便利贴面板 */
.connector-svg {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 10;
  overflow: visible;
}
.connector-path {
  fill: none;
  stroke: var(--accent-warm);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.85;
}
.connector-dot-start {
  fill: var(--accent-warm);
  opacity: 0.9;
}
.connector-dot-end {
  fill: var(--accent-warm-subtle);
  stroke: var(--accent-warm-hover);
  stroke-width: 2;
}
.connector-dot-end-inner {
  fill: var(--accent-warm-hover);
}
.task-group {
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task-group > :deep(.task-card) { margin-bottom: 0; }
.task-drag-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* vuedraggable 状态类：拖拽占位（蓝=放置目标） + 拖拽中反馈 */
.task-ghost {
  opacity: 0.55;
  background: transparent;
  border: 1px dashed var(--status-doing-text);
  border-radius: var(--radius-md);
}
.task-chosen {
  cursor: grabbing;
}
.task-drag {
  opacity: 0.92;
  box-shadow: var(--shadow-lg);
  transform: rotate(1deg);
}
.task-group-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 0 2px 6px;
  border-bottom: 1px solid var(--border-light);
}
.task-group-title {
  font-size: 11px; font-weight: 700; color: var(--status-todo-text);
  letter-spacing: 0.06em; text-transform: uppercase;
}
.task-group-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px;
  background: var(--bg-hover);
  color: var(--status-todo-text);
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 8px;
  line-height: 1.3;
}

/* 已完成分组：绿调状态色 */
.task-group.task-group-done .task-group-title {
  color: var(--status-done-text);
}
.task-group.task-group-done .task-group-count {
  background: var(--bg-hover);
  color: var(--status-done-text);
}
.area-section.mode-form { height: 100%; display: flex; flex-direction: column; margin-bottom: 0; }

</style>
