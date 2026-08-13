<template>
  <FloatPanel
    :model-value="show"
    @update:model-value="emit('update:show', $event)"
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
            <button class="pm-icon-btn" title="克隆方案（复制到新建编辑弹窗）" @click="startClone">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17h4M6 13h4M6 9h10"/><path d="M9 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M21 3h-8"/><path d="M21 7h-4"/></svg>
            </button>
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
        <div class="pm-grid">
          <!-- 左 7：方案内容（富文本只读渲染） -->
          <div class="pm-content">
            <div
              v-if="plan?.content"
              class="rich-view pm-rich"
              v-html="formatDescription(plan.content)"
              @click="onRichClick"
            ></div>
            <div v-else class="pm-content-empty">暂无内容</div>
            <div v-if="plan?.taskName" class="pm-task-link">
              <span class="pm-task-badge">已转任务</span>
              <span class="pm-task-name" @click="emit('jump-task', plan.taskId)">▸ {{ plan.taskName }}</span>
            </div>
            <div v-if="plan?.taskExists === false" class="pm-task-gone">已转任务（原任务已删除）</div>
          </div>
          <!-- 右 3：评论（任何状态可评论） -->
          <div class="pm-comments">
            <div class="pm-comments-title">评论</div>
            <div class="pm-comment-list">
              <div v-if="comments.length === 0" class="pm-comments-empty">暂无评论</div>
              <div v-for="c in comments" :key="c.id" class="pm-comment">
                <div class="pm-comment-meta">
                  <span>{{ formatTime(c.createdAt) }}</span>
                  <span class="pm-comment-del" title="删除评论" @click="confirmDeleteComment(c)">×</span>
                </div>
                <div class="pm-comment-body">{{ c.content }}</div>
              </div>
            </div>
            <div class="pm-comment-input">
              <textarea
                v-model="commentDraft"
                rows="3"
                placeholder="输入评论，回车发送"
                @keydown.enter.prevent="sendComment"
              ></textarea>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 编辑模式（新建 / 编辑共用，状态默认草稿，由阅读模式头部切换） ===== -->
    <template v-else>
      <div class="pm-edit">
        <div class="pm-edit-head">
          <input v-model="editTitle" class="pm-edit-title" placeholder="方案标题" maxlength="100" />
        </div>
        <div class="pm-edit-body">
          <component
            :is="editorComp"
            v-model="editContent"
            :project-id="projectId"
            placeholder="方案内容：记录背景、方案要点、优劣对比……"
          />
        </div>
        <div class="pm-edit-footer">
          <button class="pm-btn" @click="emit('close')">取消</button>
          <button class="pm-btn pm-btn-save" :disabled="saving" @click="savePlan">
            {{ saving ? "保存中…" : "保存" }}
          </button>
        </div>
      </div>
    </template>

    <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
  </FloatPanel>

  <ConfirmModal
    :show="confirm.show"
    :message="confirm.message"
    :confirm-text="confirm.confirmText"
    @close="confirm.show = false"
    @confirm="doConfirm"
  />
</template>

<script setup>
import { ref, computed, watch } from "vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { formatDescription } from "../../../utils/text.js";
import { useRichImagePreview } from "../../../utils/richImagePreview.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";
import { PLAN_STATUS_OPTIONS, planStatusKey } from "../../../utils/planStatus.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: String, default: "" },
  planId: { type: String, default: null }, // null = 新建
  mode: { type: String, default: "read" }, // read | edit
  clonePlan: { type: Object, default: null }, // 克隆源：新建编辑态预填其标题 + 内容（无权限控制）
});
const emit = defineEmits(["close", "changed", "jump-task", "mode-change", "clone", "update:show"]);

const editorComp = createRichEditor();
const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const plan = ref(null);
const comments = ref([]);
const statusVal = ref("草稿");
const statusSaving = ref(false);
const commentDraft = ref("");

// 编辑态（状态默认草稿，创建后由阅读模式头部切换，编辑弹窗不设状态）
const editTitle = ref("");
const editContent = ref("");
const saving = ref(false);

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

function ask(msg, confirmText, action, payload) {
  confirm.value = { show: true, message: msg, confirmText, action, payload };
}

// ===== 加载 =====
// 打开时初始化编辑字段：克隆源优先预填（无权限控制）；新建清空；编辑预填当前值
function initEdit() {
  if (props.clonePlan) {
    editTitle.value = props.clonePlan.title;
    editContent.value = props.clonePlan.content || "";
  } else if (!props.planId) {
    editTitle.value = "";
    editContent.value = "";
  } else if (plan.value) {
    editTitle.value = plan.value.title;
    editContent.value = plan.value.content || "";
  }
}

async function loadDetail() {
  if (!props.show || !props.planId) return;
  const res = await api(`api/projects/${props.projectId}/plans/${props.planId}`);
  if (res?.ok) {
    plan.value = res.data;
    comments.value = res.data.comments || [];
    statusVal.value = res.data.status || "草稿";
    // 编辑模式直接打开（不经 read）时，加载完成后再预填
    if (props.mode === "edit") initEdit();
  } else {
    toast(res?.error || "加载方案失败", "error");
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
        body: JSON.stringify({ title, content: editContent.value }),
      });
      if (!res?.ok) return toast(res?.error || "保存失败", "error");
      toast("已保存");
    } else {
      const res = await api(`api/projects/${props.projectId}/plans`, {
        method: "POST",
        body: JSON.stringify({ title, content: editContent.value }),
      });
      if (!res?.ok) return toast(res?.error || "创建失败", "error");
      toast("已创建方案");
    }
    emit("changed");
    emit("close");
  } finally {
    saving.value = false;
  }
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

// 评论
async function sendComment() {
  const content = commentDraft.value.trim();
  if (!content) return;
  const res = await api(`api/projects/${props.projectId}/plans/${props.planId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  if (res?.ok) {
    commentDraft.value = "";
    toast("已评论");
    loadDetail();
    emit("changed");
  } else {
    toast(res?.error || "评论失败", "error");
  }
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

function confirmDeleteComment(c) {
  ask(`删除这条评论？`, "删除", "delete-comment", c);
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
  if (action === "delete-comment") {
    const res = await api(`api/projects/${props.projectId}/plans/${props.planId}/comments/${c.id}`, { method: "DELETE" });
    if (res?.ok) {
      toast("已删除评论");
      loadDetail();
      emit("changed");
    } else toast(res?.error || "删除失败", "error");
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
  }
});
watch(() => props.planId, () => {
  if (props.show) {
    initEdit();
    loadDetail();
  }
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
}
.pm-edit-head {
  display: flex;
  align-items: center;
  padding: 14px 0 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 12px;
}
.pm-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 12px;
}
.pm-head-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  display: grid;
  grid-template-columns: 7fr 3fr;
  gap: 0;
  flex: 1;
  min-height: 0;
}
.pm-content {
  min-width: 0;
  overflow-y: auto;
  padding-right: 16px;
  border-right: 0.5px solid var(--border);
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
