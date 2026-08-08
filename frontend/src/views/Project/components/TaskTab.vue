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
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="任务名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="成员">
          <el-select
            v-model="form.assignees"
            multiple
            placeholder="未分配"
            clearable
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
          >
            <el-option v-for="m in members" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
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
        <el-form-item v-if="files && files.length" label="关联文件">
          <el-select
            v-model="form.fileRefs"
            multiple
            placeholder="请选择关联文件"
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
          >
            <el-option v-for="f in files" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <!-- 简述（富文本，置于表单最后一行）-->
        <el-form-item label="简述">
          <RichEditor v-model="form.description" :project-id="projectId" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogShow = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitInline">{{ isEditMode ? '保存' : '创建' }}</el-button>
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
        <div v-if="!tasks.length" class="empty-state">暂无任务</div>
        <template v-else>
<div v-if="displayedUndoneTasks.length" class="task-group">
            <div class="task-group-header">
              <span class="task-group-title">未完成</span>
              <span class="task-group-count">{{ displayedUndoneTasks.length }}</span>
            </div>
            <draggable
              :list="undoneArr"
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
                  @mark-task-done="markTaskDone"
                  @edit="startEdit"
                  @subtask="startSubtask"
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
              :list="doneArr"
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
                  @mark-task-done="markTaskDone"
                  @edit="startEdit"
              @subtask="startSubtask"
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
import AnnotationPanel from "./AnnotationPanel.vue";
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

function onSelectAnnotation({ taskId, subtaskId }) {
  // 📌 / 📝 点击只展开便利贴面板，不负责关闭
  activeTaskId.value = taskId;
  activeSubtaskId.value = subtaskId || "";
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

// 弹窗表单状态
const dialogShow = ref(false);
const saving = ref(false);
const editingId = ref(null);
const subtaskParent = ref(null);
const editingSubId = ref(null);
const form = reactive({ name: "", description: "", assignees: [], startDate: "", endDate: "", fileRefs: [] });
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
  const start = props.planStart ? toLocalMidnight(props.planStart) : -Infinity;
  const end = props.planEnd ? toLocalMidnight(props.planEnd) : Infinity;
  return t < start || t > end;
}

const isEditMode = computed(() => !!editingId.value || !!editingSubId.value);
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
        method: "PUT", body: JSON.stringify(payload),
      });
      if (res.ok) { showWarnings(res); toast("已更新"); closeInline(); load(); }
      else toast(res.error || "更新失败", "error");
    } else if (editingId.value) {
      const res = await api(`api/projects/${props.projectId}/tasks/${editingId.value}`, {
        method: "PUT", body: JSON.stringify(payload),
      });
      if (res.ok) { showWarnings(res); toast("已更新"); closeInline(); load(); }
      else toast(res.error || "更新失败", "error");
    } else if (subtaskParent.value) {
      // 子任务 / 孙任务创建（统一路径：POST tasks + parentTaskId）
      const payloadWithParent = { ...payload, parentTaskId: subtaskParent.value.id };
      const res = await api(`api/projects/${props.projectId}/tasks`, {
        method: "POST", body: JSON.stringify(payloadWithParent),
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
        method: "POST", body: JSON.stringify(payload),
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
async function markTaskDone({ task, done }) {
  if (!task) return;
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
  }
  await api(`api/projects/${props.projectId}/tasks/${task.id}`, {
    method: "PUT",
    body: JSON.stringify({ done }),
  });
  load();
}

defineExpose({ openAdd, scrollToTaskById });
</script>

<style scoped>
.area-section {
  display: flex; flex-direction: column;
  margin-bottom: 24px;
}

/* 任务弹窗：body 内边距加大（H） */
.task-dialog-el :deep(.el-dialog__body) {
  padding: 24px;
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
  stroke: oklch(0.68 0.13 65);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 6 4;
  opacity: 0.85;
  animation: connector-dash 1.2s linear infinite;
  filter: drop-shadow(0 1px 1px oklch(0.5 0.04 80 / 0.15));
}
@keyframes connector-dash {
  to { stroke-dashoffset: -20; }
}
.connector-dot-start {
  fill: oklch(0.68 0.13 65);
  opacity: 0.9;
}
.connector-dot-end {
  fill: oklch(0.96 0.04 90);
  stroke: oklch(0.55 0.13 35);
  stroke-width: 2;
  filter: drop-shadow(0 2px 3px oklch(0.5 0.05 80 / 0.22));
}
.connector-dot-end-inner {
  fill: oklch(0.55 0.13 35);
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

/* vuedraggable 状态类：蓝色拖拽占位 + 拖拽中反馈 */
.task-ghost {
  opacity: 0.5;
  background: oklch(0.82 0.10 240) !important;
  border: 1px dashed oklch(0.60 0.15 240) !important;
  border-radius: var(--radius-md);
}
.task-chosen {
  cursor: grabbing;
}
.task-drag {
  opacity: 0.92;
  box-shadow: 0 8px 20px oklch(0.3 0.05 80 / 0.18);
  transform: rotate(1deg);
}
.task-group-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 0 2px 6px;
  border-bottom: 1px dashed oklch(0.86 0.05 85);
}
.task-group-title {
  font-size: 11px; font-weight: 700; color: oklch(0.45 0.08 75);
  letter-spacing: 0.06em; text-transform: uppercase;
}
.task-group-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px;
  background: oklch(0.93 0.08 85);
  color: oklch(0.40 0.12 75);
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 8px;
  line-height: 1.3;
}

/* 已完成分组：绿调 */
.task-group.task-group-done .task-group-header {
  border-bottom-color: oklch(0.82 0.10 145);
}
.task-group.task-group-done .task-group-title {
  color: oklch(0.40 0.14 145);
}
.task-group.task-group-done .task-group-count {
  background: oklch(0.90 0.12 145);
  color: oklch(0.28 0.14 145);
}
.area-section.mode-form { height: 100%; display: flex; flex-direction: column; margin-bottom: 0; }

</style>
