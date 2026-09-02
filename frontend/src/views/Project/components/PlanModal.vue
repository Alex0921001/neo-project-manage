<template>
  <!-- X 关闭走 close（父级只关弹窗不刷新列表）；数据变化类关闭（如编辑期间被删）走 closed-detail（父级刷新） -->
  <FloatPanel
    :model-value="show"
    @update:model-value="emit('update:show', $event)"
    @close="emit('close')"
    :title="panelTitle"
    :default-width="1000"
    :default-height="640"
    :min-width="760"
    :min-height="480"
  >
    <!-- 模式切换说明：read = 阅读（7:3 左右分栏 + 评论）；edit = 编辑（纯编辑器，评论栏隐藏） -->
    <!-- ===== 阅读模式 ===== -->
    <template v-if="mode === 'read'">
      <div class="pm-read">
        <div class="pm-head">
          <div class="pm-head-nav">
            <button v-if="canPrev" class="pm-nav-btn" title="上一条" @click="emit('prev')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button v-if="canNext" class="pm-nav-btn" title="下一条" @click="emit('next')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <span class="pm-head-title">{{ plan?.title || "方案" }}</span>
          <div class="pm-head-ops">
            <el-select
              v-model="statusVal"
              size="small"
              style="width: 104px"
              @change="onStatusChange"
              :disabled="statusSaving || !!plan?.taskExists"
              :title="plan?.taskExists ? '已转任务且任务存在，状态已冻结' : ''"
            >
              <el-option v-for="s in PLAN_STATUS_OPTIONS" :key="s" :label="s" :value="s" />
            </el-select>
            <!-- 克隆：无权限控制，复制当前方案到新建编辑弹窗（保存即新建） -->
            <button class="pm-btn" title="版本历史（每次保存自动存版）" @click="versionShow = true">版本</button>
            <button class="pm-btn" title="克隆方案（复制到新建编辑弹窗）" @click="startClone">克隆</button>
            <button
              v-if="plan?.status === '已采纳'"
              class="pm-btn pm-btn-primary"
              title="转为任务"
              @click="confirmConvert"
            >转任务</button>
            <button v-if="plan?.status === '草稿' || plan?.status === '进行中'" class="pm-icon-btn" title="编辑" @click="enterEdit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button v-if="plan?.status === '草稿' || plan?.status === '已废弃'" class="pm-icon-btn pm-icon-danger" title="删除" @click="confirmDelete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
        <div class="pm-grid" :class="{ 'pm-grid-folded': commentsCollapsed }">
          <!-- 评论折叠切换按钮（V2.1.3）：展开态显示 >（收起），折叠态显示 <（展开） -->
          <button
            class="pm-comments-toggle"
            :class="{ folded: commentsCollapsed }"
            :title="commentsCollapsed ? '展开评论' : '收起评论'"
            @click="commentsCollapsed = !commentsCollapsed"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="!commentsCollapsed" d="M15 18l-6-6 6-6"></path>
              <path v-else d="M9 18l6-6-6-6"></path>
            </svg>
          </button>
          <!-- 左 7：方案内容（富文本只读渲染 + 划词引用气泡） -->
          <div class="pm-content" ref="richContainer" @mouseup="onSelectionMouseup">
            <div
              v-if="plan?.content"
              class="rich-view pm-rich"
              v-html="formatDescription(plan.content)"
              @click="onRichViewClick"
            ></div>
            <div v-else class="pm-content-empty">暂无内容</div>
            <div v-if="plan?.taskName" class="pm-task-link">
              <span class="pm-task-badge">已转任务</span>
              <span class="pm-task-name" @click="emit('jump-task', plan.taskId)">▸ {{ plan.taskName }}</span>
            </div>
            <div v-if="plan?.taskExists === false" class="pm-task-gone">已转任务（原任务已删除）</div>
            <!-- V2.1.3 需求管理：方案反向展示关联需求 -->
            <div v-if="plan?.requirements?.length" class="pm-reqs">
              <div class="pm-reqs-title">关联需求（{{ plan.requirements.length }}）</div>
              <div v-for="r in plan.requirements" :key="r.id" class="pm-req-item">
                <span class="pm-req-dot" :class="`dot-${r.status}`"></span>
                <span class="pm-req-name">{{ r.name }}</span>
                <span class="pm-req-status">{{ r.status }}</span>
              </div>
            </div>
            <!-- 划词引用气泡（V2.6）：选中文字后弹出 -->
            <div v-if="quoteBubble" class="quote-bubble" :style="{ left: quoteBubble.x + 'px', top: quoteBubble.y + 'px' }">
              <button class="quote-bubble-btn" @click="quoteNow">引用</button>
            </div>
          </div>
          <!-- 右：评论（公共 CommentPanel，V2.6：编辑/输入框放大/分栏宽度拖拽） -->
          <CommentPanel
            v-show="!commentsCollapsed"
            ref="commentPanel"
            :project-id="projectId"
            target-type="plan"
            :target-id="planId || ''"
            @loaded="onCommentsLoaded"
            @changed="emit('changed')"
            @quoted="onQuoted"
            @locate-quote="locateQuoteInBody"
          />
        </div>
      </div>
    </template>

    <!-- ===== 编辑模式（新建 / 编辑共用，状态默认草稿，由阅读模式头部切换） ===== -->
    <template v-else>
      <div class="pm-edit">
        <div class="pm-edit-head">
          <input v-model="editTitle" class="pm-edit-title" placeholder="方案标题" maxlength="100" />
          <button class="pm-import-btn" :disabled="importing" title="从文件导入（txt / md / docx）" @click="importFileInput?.click()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {{ importing ? "解析中..." : "从文件导入" }}
          </button>
          <input ref="importFileInput" type="file" class="pm-import-file" accept=".txt,.md,.markdown,.docx" @change="onFileSelected" />
        </div>
        <div class="pm-edit-body">
          <component
            :is="editorComp"
            v-model="editContent"
            :project-id="projectId"
            placeholder="方案内容：记录背景、方案要点、优劣对比……"
          />
        </div>
        <!-- V2.2 R14：关联任务 + 关联需求并排一行（五五开） -->
        <div class="pm-edit-assoc">
          <div class="pm-edit-tasks">
            <el-tree-select
              v-model="editTaskIds"
              :data="taskTree"
            multiple
            check-strictly
            filterable
            node-key="id"
            :props="{ label: 'name', children: 'children' }"
            collapse-tags
            collapse-tags-tooltip
            size="small"
            style="width: 100%"
            :placeholder="taskTree.length ? '关联任务（多选，父子不联动）' : '项目暂无任务'"
          />
          </div>
          <div class="pm-edit-plans">
            <el-select
              v-model="editRequirementIds"
            multiple
            filterable
            size="small"
            style="width: 100%"
            :placeholder="requirements.length ? '关联需求（多选）' : '项目暂无需求'"
          >
            <el-option v-for="r in requirements" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          </div>
        </div>
        <div class="pm-edit-footer">
          <button class="pm-btn" @click="cancelEdit">取消</button>
          <button class="pm-btn pm-btn-save" :disabled="saving" @click="savePlan">
            {{ saving ? "保存中…" : "保存" }}
          </button>
        </div>
      </div>
    </template>

    <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
  </FloatPanel>

  <!-- 版本历史弹窗（V2.6） -->
  <VersionModal
    :show="versionShow"
    :project-id="projectId"
    target-type="plan"
    :target-id="planId || ''"
    @update:show="versionShow = $event"
    @close="versionShow = false"
    @restored="onVersionRestored"
  />

  <ConfirmModal
    :show="confirm.show"
    :message="confirm.message"
    :confirm-text="confirm.confirmText"
    @close="settleCommentConfirm(false); confirm.show = false"
    @confirm="doConfirm"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";
import { api, apiUpload } from "../../../api.js";
import { toast } from "../../../toast.js";
import { formatDescription } from "../../../utils/text.js";
import { useRichImagePreview } from "../../../utils/richImagePreview.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";
import { PLAN_STATUS_OPTIONS, planStatusKey } from "../../../utils/planStatus.js";
import CommentPanel from "./CommentPanel.vue";
import VersionModal from "./VersionModal.vue";
import { useQuoteSelection } from "../../../utils/useQuoteSelection.js";
import { applyQuoteToDom, quoteIdFromEvent } from "../../../utils/quoteComment.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: String, default: "" },
  planId: { type: String, default: null }, // null = 新建
  mode: { type: String, default: "read" }, // read | edit
  clonePlan: { type: Object, default: null }, // 克隆源：新建编辑态预填其标题 + 内容（无权限控制）
  canPrev: { type: Boolean, default: false }, // R10：列表首条为 false
  canNext: { type: Boolean, default: false }, // R10：列表末条为 false
});
const emit = defineEmits(["close", "changed", "jump-task", "mode-change", "clone", "update:show", "prev", "next", "saved", "created", "edit-cancel", "closed-detail"]);

const editorComp = createRichEditor();
const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const plan = ref(null);
const commentPanel = ref(null); // V2.6 公共评论面板（数据内聚）
const statusVal = ref("草稿");
const statusSaving = ref(false);
const commentsCollapsed = ref(true); // 评论折叠：加载详情后按评论数初始化（有评论展开，无评论闭合）
const versionShow = ref(false); // V2.6 版本历史弹窗

/** 版本还原后刷新详情（内容可能已变） */
function onVersionRestored() {
  loadDetail();
  emit("changed");
}

// 编辑态（状态默认草稿，创建后由阅读模式头部切换，编辑弹窗不设状态）
const editTitle = ref("");
const editContent = ref("");
const saving = ref(false);
// V2.1.4 方案侧关联需求（多对多，编辑态多选）
const requirements = ref([]);
const editRequirementIds = ref([]);
async function loadRequirements() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}/requirements?limit=100`);
  if (res?.ok) requirements.value = res.data.items || [];
}

// V2.2 R14 方案侧关联任务（树形多选，父子不联动：check-strictly 下不勾父自动勾子）
const taskTree = ref([]);
const editTaskIds = ref([]);
async function loadTasks() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}/tasks`);
  if (res?.ok) taskTree.value = buildTaskTreeFromFlat(res.data || []);
}
// 扁平任务（listTasks 含 parent_task_id）→ 树（id 唯一，子任务挂到父节点 children）
function buildTaskTreeFromFlat(flat) {
  const map = new Map(flat.map((t) => [t.id, { ...t, children: [] }]));
  const roots = [];
  for (const node of map.values()) {
    if (node.parent_task_id && map.has(node.parent_task_id)) {
      map.get(node.parent_task_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ===== 从文件导入（txt / md / docx，仅新建/编辑态） =====
const importFileInput = ref(null);
const importing = ref(false);

async function onFileSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = ""; // 允许重复选择同一文件
  if (!file) return;
  importing.value = true;
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiUpload(`api/projects/${props.projectId}/plans/import`, fd);
    if (!res?.ok) return toast(res?.error || "导入失败", "error");
    if (res.data?.title) editTitle.value = res.data.title;
    if (res.data?.content) editContent.value = res.data.content;
    toast("已导入，可在下方编辑器中修正后保存");
  } catch (err) {
    toast(err?.message || "导入失败", "error");
  } finally {
    importing.value = false;
  }
}

// 确认弹窗
const confirm = ref({ show: false, message: "", confirmText: "确认", action: "", payload: null });

const panelTitle = computed(() => {
  if (props.mode === "edit") return props.planId ? "编辑方案" : "新建方案";
  return "方案详情";
});

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// CommentPanel 挂载后注入删除确认回调（数据内聚，确认弹窗用本弹窗的 ConfirmModal）
watch(commentPanel, (panel) => panel?.setConfirmHandler?.(onCommentAsk), { immediate: true });

// ===== 划词引用评论（V2.6）=====
const richContainer = ref(null);
const { bubble: quoteBubble, onSelectionMouseup, takeAnchor, hideBubble } = useQuoteSelection(richContainer, {
  enabled: () => props.mode === "read" && !saving.value,
});

/** 气泡【引用】：展开评论面板，输入框挂起引用锚，用户输入后提交 */
function quoteNow() {
  const anchor = takeAnchor();
  if (!anchor) return;
  commentsCollapsed.value = false;
  nextTick(() => commentPanel.value?.beginQuote(anchor));
}

/** 评论提交成功（带引用）：DOM 立即打高亮 → 把带 span 的 HTML 持久化到方案 */
async function onQuoted({ comment, anchor }) {
  const container = richContainer.value?.querySelector(".rich-view");
  const ok = container ? applyQuoteToDom(container, anchor, comment.id) : false;
  const newHtml = ok
    ? container.innerHTML
    : wrapQuoteInHtml(plan.value?.content, anchor, comment.id);
  if (newHtml === plan.value?.content) return;
  const res = await api(`api/projects/${props.projectId}/plans/${props.planId}`, {
    method: "PUT",
    body: JSON.stringify({ content: newHtml }),
  });
  if (res?.ok) plan.value = { ...plan.value, content: newHtml };
}

/** 点击正文高亮 → 评论面板定位到对应评论 */
function locateCommentFromQuote(e) {
  const id = quoteIdFromEvent(e);
  if (!id) return;
  commentsCollapsed.value = false;
  nextTick(() => commentPanel.value?.scrollToComment(id));
}

/** 点击正文富文本：引用高亮 → 定位评论；图片 → 预览 */
function onRichViewClick(e) {
  locateCommentFromQuote(e);
  onRichClick(e);
}

/** 点击评论引用块 → 正文高亮定位 + 闪烁；孤立引用提示 */
function locateQuoteInBody(c) {
  const container = richContainer.value;
  if (!container) return;
  const marks = container.querySelectorAll(`[data-quote-comment="${c.id}"]`);
  if (!marks.length) {
    toast("原文已修改或删除，无法定位", "error");
    return;
  }
  marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
  marks.forEach((m) => m.classList.add("qc-flash"));
  setTimeout(() => marks.forEach((m) => m.classList.remove("qc-flash")), 1400);
}

function ask(msg, confirmText, action, payload) {
  confirm.value = { show: true, message: msg, confirmText, action, payload };
}

// ===== 评论删除确认（CommentPanel 回调）：Promise 化，确认/取消都能收口 =====
let commentConfirmResolve = null;
function onCommentAsk() {
  return new Promise((resolve) => {
    commentConfirmResolve = resolve;
    ask("删除这条评论？", "删除", "comment-delete", null);
  });
}
function settleCommentConfirm(ok) {
  if (commentConfirmResolve) {
    commentConfirmResolve(ok);
    commentConfirmResolve = null;
  }
}

// ===== 加载 =====
// 打开时初始化编辑字段：克隆源优先预填（无权限控制）；新建清空；编辑预填当前值
function initEdit() {
  if (props.clonePlan) {
    editTitle.value = props.clonePlan.title;
    editContent.value = props.clonePlan.content || "";
    editRequirementIds.value = [...(props.clonePlan.requirementIds || [])];
    editTaskIds.value = [...(props.clonePlan.taskRefs || []).map((t) => t.id)];
  } else if (!props.planId) {
    editTitle.value = "";
    editContent.value = "";
    editRequirementIds.value = [];
    editTaskIds.value = [];
  } else if (plan.value) {
    editTitle.value = plan.value.title;
    editContent.value = plan.value.content || "";
    editRequirementIds.value = (plan.value.requirements || []).map((r) => r.id);
    editTaskIds.value = (plan.value.taskRefs || []).map((t) => t.id);
  }
}

let loadSeq = 0; // R10 详情加载竞态防护：仅最新一次请求的响应可写入
async function loadDetail() {
  if (!props.show || !props.planId) return;
  const seq = ++loadSeq;
  const res = await api(`api/projects/${props.projectId}/plans/${props.planId}`);
  if (seq !== loadSeq) return; // 过期响应丢弃，避免旧请求覆盖新结果
  if (res?.ok) {
    plan.value = res.data;
    // 评论折叠默认态：有评论默认展开，无评论默认闭合（评论数据由 CommentPanel 自拉）
    commentsCollapsed.value = (res.data.comments || []).length === 0;
    statusVal.value = res.data.status || "草稿";
    // 编辑模式直接打开（不经 read）时，加载完成后再预填
    if (props.mode === "edit") initEdit();
  } else {
    // R15：详情接口返回不存在（编辑期间被删）→ toast + 回列表刷新 + 关弹窗，不白屏
    toast(res?.error || "加载方案失败", "error");
    emit("closed-detail");
    emit("close");
  }
}

// 进入编辑：预填当前值
function enterEdit() {
  if (!plan.value) return;
  initEdit();
  emit("mode-change", "edit");
}

// 新建：直接进入编辑态（由 PlanTab 调 openCreate 时 mode 已为 edit）

// 保存（新建/编辑）
async function savePlan() {
  const title = editTitle.value.trim();
  if (!title) return toast("方案标题不能为空", "error");
  saving.value = true;
  try {
    if (props.planId) {
      const res = await api(`api/projects/${props.projectId}/plans/${props.planId}`, {
        method: "PUT",
        body: JSON.stringify({ title, content: editContent.value, requirementIds: editRequirementIds.value, taskIds: editTaskIds.value }),
      });
      if (!res?.ok) return toast(res?.error || "保存失败", "error");
      toast("已保存");
      // R15：编辑保存不再直接关弹窗，交给父级决定「回落详情」或「关弹窗刷新列表」
      emit("saved", props.planId);
    } else {
      const res = await api(`api/projects/${props.projectId}/plans`, {
        method: "POST",
        body: JSON.stringify({ title, content: editContent.value, requirementIds: editRequirementIds.value, taskIds: editTaskIds.value }),
      });
      if (!res?.ok) return toast(res?.error || "创建失败", "error");
      toast("已创建方案");
      // 新建保存：通知父级关弹窗 + 刷新列表
      emit("created");
    }
  } finally {
    saving.value = false;
  }
}

// R15：编辑态取消，交给父级决定「回落详情」或「关弹窗」
function cancelEdit() {
  emit("edit-cancel");
}

// 状态切换（阅读模式）
async function onStatusChange(v) {
  if (!plan.value || v === plan.value.status) return;
  statusSaving.value = true;
  try {
    const res = await api(`api/projects/${props.projectId}/plans/${props.planId}`, {
      method: "PUT",
      body: JSON.stringify({ status: v }),
    });
    if (res?.ok) {
      plan.value.status = v;
      toast(`已切换为「${v}」`);
      emit("changed");
    } else {
      toast(res?.error || "状态切换失败", "error");
      statusVal.value = plan.value.status;
    }
  } finally {
    statusSaving.value = false;
  }
}

// 评论（V2.6：数据内聚在 CommentPanel；删除确认复用本弹窗 ConfirmModal）
function onCommentsLoaded(count) {
  commentsCollapsed.value = count === 0;
}

// 克隆：通知父级以当前方案为克隆源重开新建编辑态（planId 置空，保存走新建）
function startClone() {
  if (!plan.value) return;
  emit("clone", plan.value);
}

// 复制方案：标题 + 内容（纯文本，去 HTML）；clipboard API 失败时降级 execCommand
async function copyPlan() {
  if (!plan.value) return;
  const plain = String(plan.value.content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = `${plan.value.title}${plain ? `\n\n${plain}` : ""}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制标题 + 内容");
  } catch {
    // 降级：textarea + execCommand（非安全上下文 / iframe 未授权 clipboard）
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    document.body.removeChild(ta);
    if (ok) toast("已复制标题 + 内容");
    else toast("复制失败，请手动选择复制", "error");
  }
}

function confirmDelete() {
  ask(`确认删除方案「${plan.value?.title}」？评论将一并删除，转出的任务不受影响。`, "删除方案", "delete", null);
}
function confirmConvert() {
  if (plan.value?.status !== "已采纳") return toast("仅「已采纳」状态的方案可转任务", "error");
  if (plan.value?.taskExists) return toast("该方案已转为任务，不能重复转换", "error");
  ask(`将方案「${plan.value?.title}」转为任务？任务名 = 方案标题，内容 = 方案内容。`, "转任务", "convert", null);
}

async function doConfirm() {
  // 点击确认后立即关闭确认框（异步操作后台执行，结果以 toast 呈现）
  confirm.value.show = false;
  const action = confirm.value.action;
  const c = confirm.value.payload;
  if (action === "comment-delete") {
    settleCommentConfirm(true);
  } else if (action === "delete") {
    const res = await api(`api/projects/${props.projectId}/plans/${props.planId}`, { method: "DELETE" });
    if (res?.ok) {
      toast("已删除方案");
      emit("changed");
      emit("close");
    } else toast(res?.error || "删除失败", "error");
  } else if (action === "convert") {
    const res = await api(`api/projects/${props.projectId}/plans/${props.planId}/convert`, { method: "POST" });
    if (res?.ok) {
      toast("已转为任务");
      loadDetail();
      emit("changed");
    } else toast(res?.error || "转任务失败", "error");
  }
}

// 打开时：初始化编辑字段 + 加载详情；planId 变化刷新
watch(() => props.show, (v) => {
  if (v) {
    initEdit();
    loadDetail();
    loadRequirements();
    loadTasks();
  }
});
watch(() => props.planId, () => {
  if (props.show) {
    initEdit();
    loadDetail();
    loadRequirements();
    loadTasks();
  }
});
// 克隆源变化兜底：详情内克隆（read→edit 切换、planId 同 tick 置空）时强制预填，与右击克隆效果对齐
watch(
  () => props.clonePlan,
  (v) => {
    if (v && props.show && props.mode === "edit") {
      editTitle.value = v.title;
      editContent.value = v.content || "";
      editRequirementIds.value = [...(v.requirementIds || [])];
      editTaskIds.value = [...(v.taskRefs || []).map((t) => t.id)];
    }
  },
  { immediate: true }
);
// R15 补：详情开着时列表右键编辑同一方案（show/planId 未变只 mode 变）→ 预填表单，避免空表单覆盖原关联
watch(() => props.mode, (m) => {
  if (props.show && m === "edit") initEdit();
});
</script>

<style scoped>
.pm-read,
.pm-edit {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0 16px 16px;
  position: relative; /* V2.1.3 评论折叠按钮定位基准 */
}
/* V2.1.3 评论折叠：右上角圆形切换按钮 */
.pm-comments-toggle {
  position: absolute;
  top: 48px;
  right: 6px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-fast) var(--ease-out);
}
.pm-comments-toggle:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.pm-comments-toggle.folded {
  right: 12px;
}
.pm-edit-head {
  display: flex;
  align-items: center;
  padding: 14px 0 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 12px;
}
.pm-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 16px 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 12px;
  flex-shrink: 0;
}
/* 导航按钮：工具栏最左侧，键间呼吸间距 */
.pm-head-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.pm-head-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 55%;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* R10 详情切换箭头按钮（左右两侧） */
.pm-nav-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.pm-nav-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.pm-head-ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.pm-btn {
  border: 0.5px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.pm-btn:hover {
  background: var(--bg-hover);
}
.pm-btn-primary {
  border-color: transparent;
  background: var(--accent-warm);
  color: #fff;
}
.pm-btn-primary:hover {
  background: var(--accent-warm-hover);
}
.pm-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pm-btn-danger {
  color: var(--status-delay-text);
}
.pm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.pm-icon-btn:hover {
  background: var(--bg-hover);
}
.pm-icon-danger {
  color: var(--status-delay-text);
}
.pm-grid {
  /* V2.6：改 flex，评论面板宽度由 CommentPanel 自控（拖拽 260~480） */
  display: flex;
  gap: 0;
  flex: 1;
  min-height: 0;
}
/* V2.1.3 评论折叠：评论栏隐藏时内容区占满 */
.pm-grid-folded .pm-content {
  border-right: none;
}
.pm-content {
  min-width: 0;
  overflow-y: auto;
  padding-right: 16px;
  border-right: 0.5px solid var(--border);
  position: relative; /* 划词引用气泡定位基准 */
}
.pm-rich {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text);
}
.pm-content-empty {
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}
.pm-task-link {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pm-task-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  color: var(--status-done-text);
  background: oklch(0.94 0.05 162);
}
.pm-task-name {
  color: var(--link);
  font-size: 13px;
  cursor: pointer;
}
.pm-task-name:hover {
  text-decoration: underline;
}
.pm-task-gone {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-tertiary);
}
/* V2.1.3 关联需求（方案反向展示） */
.pm-reqs {
  margin-top: 14px;
  border-top: 0.5px solid var(--border);
  padding-top: 10px;
}
.pm-reqs-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}
.pm-req-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 12px;
}
.pm-req-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pm-req-dot.dot-待处理 { background: var(--text-tertiary); }
.pm-req-dot.dot-已完成 { background: #2ea043; }
.pm-req-dot.dot-已取消 { background: var(--border); }
.pm-req-name {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-req-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.pm-comments {
  min-width: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.pm-comments-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}
/* 评论列表：撑满剩余空间，超出滚动 */
.pm-comment-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-comments-empty {
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
  padding: 24px 0;
}
.pm-comment {
  border-left: 2px solid var(--accent-warm);
  padding-left: 10px;
  border-radius: 0;
}
.pm-comment-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-tertiary);
}
.pm-comment-del {
  cursor: pointer;
  font-size: 16px;
  color: var(--text-tertiary);
  visibility: hidden;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  line-height: 1;
}
.pm-comment:hover .pm-comment-del {
  visibility: visible;
}
.pm-comment-del:hover {
  color: var(--status-delay-text);
  background: var(--bg-hover);
}
.pm-comment-body {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
}
.pm-comment-input {
  flex-shrink: 0;
  display: flex;
}
.pm-comment-input textarea {
  flex: 1;
  min-width: 0;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  resize: none;
  line-height: 1.5;
}
.pm-edit-title {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  outline: none;
  font-family: inherit;
}
.pm-edit-title:focus {
  outline: 1px dashed var(--text-tertiary);
  outline-offset: 2px;
}
/* 从文件导入按钮（标题右侧） */
.pm-import-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  margin-left: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.pm-import-btn:hover {
  color: var(--text);
  border-color: var(--text-tertiary);
  background: var(--bg-hover);
}
.pm-import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pm-import-file {
  display: none;
}
.pm-edit-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 富文本编辑器自适应撑满剩余空间（仅方案弹窗内生效，不影响其他使用处） */
.pm-edit-body :deep(.rich-editor) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.pm-edit-body :deep(.rich-content) {
  flex: 1;
  min-height: 0;
  max-height: none;
}
/* V2.2 编辑态关联需求+关联任务：并排一行五五开，四周留呼吸间距 */
.pm-edit-assoc {
  display: flex;
  gap: 14px;
  padding: 12px 0 4px;
  flex-shrink: 0;
}
.pm-edit-assoc .pm-edit-tasks,
.pm-edit-assoc .pm-edit-plans {
  flex: 1;
  min-width: 0;
  padding: 0;
}
.pm-edit-assoc :deep(.el-select__wrapper),
.pm-edit-assoc :deep(.el-tree-select__wrapper) {
  min-height: 38px;
}
.pm-edit-assoc :deep(.el-select__selection),
.pm-edit-assoc :deep(.el-tree-select__selection) {
  min-height: 34px;
}
.pm-edit-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 0.5px solid var(--border);
  margin-top: 12px;
}
.pm-btn-save {
  border-color: transparent;
  background: var(--text);
  color: var(--bg-card);
}
.pm-btn-save:hover:not(:disabled) {
  background: var(--text-light);
}
.pm-btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
