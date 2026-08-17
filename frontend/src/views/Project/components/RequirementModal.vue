<template>
  <!-- X 关闭走 close（父级只关弹窗不刷新列表）；数据变化类关闭（如编辑期间被删）走 closed-detail（父级刷新） -->
  <FloatPanel
    :model-value="show"
    @update:model-value="emit('update:show', $event)"
    @close="emit('close')"
    :title="panelTitle"
    :default-width="880"
    :default-height="600"
    :min-width="700"
    :min-height="440"
  >
    <!-- ===== 阅读模式：7:3 左内容 + 右关联方案（无评论栏） ===== -->
    <template v-if="mode === 'read'">
      <div class="rq-read">
        <div class="rq-head">
          <div class="rq-head-nav">
            <button v-if="canPrev" class="rq-nav-btn" title="上一条" @click="emit('prev')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button v-if="canNext" class="rq-nav-btn" title="下一条" @click="emit('next')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <span class="rq-head-title">{{ req?.name || "需求" }}</span>
          <div class="rq-head-ops">
            <!-- 状态下拉：三态自由切换（对齐方案弹窗） -->
            <el-select
              v-model="statusVal"
              size="small"
              style="width: 104px"
              :disabled="statusSaving"
              @change="onStatusChange"
            >
              <el-option v-for="s in REQUIREMENT_STATUSES" :key="s" :label="s" :value="s" />
            </el-select>
            <button v-if="req?.status === '待处理'" class="pm-icon-btn" title="编辑" @click="enterEdit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button v-if="req?.status !== '已完成'" class="pm-icon-btn pm-icon-danger" title="删除" @click="askDelete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
        <div class="rq-grid">
          <!-- 左 7：需求内容（富文本只读渲染） -->
          <div class="rq-content">
            <div
              v-if="req?.description"
              class="rich-view rq-rich"
              v-html="formatDescription(req.description)"
              @click="onRichClick"
            ></div>
            <div v-else class="rq-content-empty">暂无内容</div>
          </div>
          <!-- 右 3：关联方案（替代评论栏，需求↔方案多对多） -->
          <div class="rq-plans">
            <div class="rq-plans-title">关联方案（{{ req?.plans?.length || 0 }}）</div>
            <div v-if="!req?.plans?.length" class="rq-plans-empty">暂无关联方案<br /><span class="rq-plans-hint">编辑需求可关联方案</span></div>
            <div v-for="pl in req?.plans || []" :key="pl.id" class="rq-plan-item">
              <span class="rq-plan-dot" :class="`dot-${planStatusKey(pl.status)}`"></span>
              <span class="rq-plan-title" :title="pl.title">{{ pl.title }}</span>
              <span class="rq-plan-status">{{ pl.status }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 编辑模式（新建 / 编辑共用） =====
         布局：标题 + 优先级同行（优先级居右）；富文本撑满剩余；关联方案最后一行 -->
    <template v-else>
      <div class="rq-edit">
        <div class="rq-edit-head">
          <input v-model="form.name" class="rq-edit-title" placeholder="需求名称" maxlength="50" />
          <el-select v-model="form.priority" size="small" style="width: 80px">
            <el-option v-for="p in PRIORITY_OPTIONS" :key="p" :label="p" :value="p" />
          </el-select>
        </div>
        <div class="rq-edit-body">
          <component
            :is="editorComp"
            v-model="form.description"
            :project-id="projectId"
            placeholder="需求描述：背景、验收标准……"
          />
        </div>
        <div class="rq-edit-plans">
          <el-select
            v-model="form.planIds"
            multiple
            filterable
            size="small"
            style="width: 100%"
            :placeholder="plans.length ? '关联方案（多选）' : '项目暂无方案'"
          >
            <el-option v-for="pl in plans" :key="pl.id" :label="pl.title" :value="pl.id" />
          </el-select>
        </div>
        <div class="rq-edit-footer">
          <button class="pm-btn" @click="cancelEdit">取消</button>
          <button class="pm-btn pm-btn-save" :disabled="saving || !form.name.trim()" @click="save">
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
import { planStatusKey } from "../../../utils/planStatus.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: String, default: "" },
  requirementId: { type: String, default: null }, // null = 新建
  mode: { type: String, default: "read" }, // read | edit（初始模式）
  canPrev: { type: Boolean, default: false }, // R10：列表首条为 false
  canNext: { type: Boolean, default: false }, // R10：列表末条为 false
});
const emit = defineEmits(["close", "changed", "update:show", "prev", "next", "saved", "created", "edit-cancel", "closed-detail", "mode-change"]);

const editorComp = createRichEditor();
const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const PRIORITY_OPTIONS = ["P0", "P1", "P2", "P3", "P4", "P5"];

const mode = ref(props.mode);
// 当前需求 id（新建保存后内部推进；props.requirementId 只作初始/父级更新来源）
const currentId = ref(props.requirementId);
const req = ref(null);
const saving = ref(false);

// 状态（阅读模式头部下拉切换：待处理可流转，终态冻结）
const REQUIREMENT_STATUSES = ["待处理", "已完成", "已取消"];
const statusVal = ref("待处理");
const statusSaving = ref(false);
watch(req, (v) => { if (v) statusVal.value = v.status; });
async function onStatusChange(status) {
  if (!currentId.value || status === req.value?.status) return;
  statusSaving.value = true;
  const res = await api(`api/projects/${props.projectId}/requirements/${currentId.value}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  statusSaving.value = false;
  if (res?.ok) {
    toast(`已标记为「${status}」`);
    req.value = res.data;
    statusVal.value = res.data.status;
    emit("changed");
  } else {
    statusVal.value = req.value?.status || "待处理"; // 失败回滚
    toast(res?.error || "状态流转失败", "error");
  }
}

// 编辑表单
const form = ref({ name: "", description: "", priority: "P3", planIds: [] });

// 方案数据源（关联多选）
const plans = ref([]);
async function loadPlans() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}/plans?limit=100`);
  if (res?.ok) plans.value = res.data.items || [];
}

const panelTitle = computed(() => {
  if (mode.value === "edit") return req.value ? "编辑需求" : "新建需求";
  return "需求详情";
});

let loadSeq = 0; // R10 详情加载竞态防护：仅最新一次请求的响应可写入
async function loadDetail() {
  if (!currentId.value) return;
  const seq = ++loadSeq;
  const res = await api(`api/projects/${props.projectId}/requirements/${currentId.value}`);
  if (seq !== loadSeq) return; // 过期响应丢弃，避免旧请求覆盖新结果
  if (res?.ok) {
    req.value = res.data;
    form.value = {
      name: res.data.name || "",
      description: res.data.description || "",
      priority: res.data.priority || "P3",
      planIds: [...(res.data.planIds || [])],
    };
  } else {
    // R15：详情接口返回不存在（编辑期间被删）→ toast + 回列表刷新 + 关弹窗，不白屏
    toast(res?.error || "加载失败", "error");
    emit("closed-detail");
    emit("close");
  }
}

function init() {
  mode.value = props.mode;
  currentId.value = props.requirementId;
  req.value = null;
  form.value = { name: "", description: "", priority: "P3", planIds: [] };
  loadPlans(); // 打开时加载方案数据源（关联多选选项）
  if (currentId.value) loadDetail();
  else mode.value = "edit"; // 新建直接进编辑模式
}
watch(() => props.show, (v) => { if (v) init(); });
// 弹窗已开时点击列表其他需求：id 变化重新加载（对齐方案弹窗的切换行为）
watch(() => props.requirementId, () => { if (props.show) init(); });
// 模式变化（如详情开着时右键「编辑」同一行）：强制重初始化，切到编辑态
watch(() => props.mode, () => { if (props.show) init(); });

// ===== 保存（新建 / 编辑） =====
async function save() {
  if (!form.value.name.trim()) return toast("请输入需求名称", "error");
  saving.value = true;
  const body = {
    name: form.value.name,
    description: form.value.description,
    priority: form.value.priority,
    planIds: form.value.planIds,
  };
  const isEdit = !!currentId.value;
  const url = `api/projects/${props.projectId}/requirements${isEdit ? `/${currentId.value}` : ""}`;
  const res = await api(url, { method: isEdit ? "PUT" : "POST", body: JSON.stringify(body) });
  saving.value = false;
  if (!res?.ok) return toast(res?.error || "保存失败", "error");
  toast(isEdit ? "已更新需求" : "已创建需求");
  // R15：编辑保存交给父级决定「回落详情」或「关弹窗刷新」；新建由父级关弹窗刷新
  if (isEdit) emit("saved", currentId.value);
  else emit("created");
}

function cancelEdit() {
  // R15：编辑取消交给父级决定「回落详情」或「关弹窗」
  emit("edit-cancel");
}

// 详情内点编辑：切内部编辑态 + 通知父级记录来源
function enterEdit() {
  mode.value = "edit";
  emit("mode-change", "edit");
}

// ===== 删除 =====
const confirm = ref({ show: false, message: "", confirmText: "删除", action: "" });
function askDelete() {
  confirm.value = {
    show: true,
    message: `确认删除需求「${req.value?.name}」？关联方案不受影响。`,
    confirmText: "删除",
    action: "delete",
  };
}
async function doConfirm() {
  confirm.value.show = false;
  if (confirm.value.action !== "delete" || !currentId.value) return;
  const res = await api(`api/projects/${props.projectId}/requirements/${currentId.value}`, { method: "DELETE" });
  if (res?.ok) {
    toast("已删除需求");
    emit("changed");
    emit("close");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}

defineExpose({ loadDetail });
</script>

<style scoped>
/* ===== 阅读模式 ===== */
.rq-read {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.rq-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 16px 12px;
  border-bottom: 0.5px solid var(--border-light);
  flex-shrink: 0;
}
/* 导航按钮：工具栏最左侧，键间呼吸间距 */
.rq-head-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.rq-head-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 55%;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* R10 详情切换箭头按钮（左右两侧） */
.rq-nav-btn {
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
.rq-nav-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.rq-head-ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 操作图标按钮（对齐方案弹窗） */
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

/* 7:3 分栏 */
.rq-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 7fr 3fr;
  gap: 16px;
  padding: 16px;
}
.rq-content {
  min-width: 0;
  overflow-y: auto;
  font-size: 13px;
  color: var(--text);
  line-height: 1.7;
}
.rq-rich { padding-right: 4px; }
.rq-content-empty {
  color: var(--text-tertiary);
  font-size: 13px;
}

/* 右栏：关联方案 */
.rq-plans {
  min-width: 0;
  padding-left: 16px;
  border-left: 0.5px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rq-plans-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.rq-plans-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}
.rq-plans-hint { font-size: 11px; }
.rq-plan-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px; /* 左右边距统一 10px */
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 12px;
}
.rq-plan-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rq-plan-dot.dot-草稿 { background: var(--text-tertiary); }
.rq-plan-dot.dot-进行中 { background: var(--accent-warm); }
.rq-plan-dot.dot-已采纳 { background: #2ea043; }
.rq-plan-dot.dot-已废弃 { background: var(--border); }
.rq-plan-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.rq-plan-status {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* ===== 编辑模式 ===== */
.rq-edit {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.rq-edit-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 0.5px solid var(--border);
  margin-bottom: 12px;
  flex-shrink: 0;
}
.rq-edit-title {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  font-family: inherit;
  padding: 4px 2px;
}
.rq-edit-title:focus {
  outline: 1px dashed var(--text-tertiary);
  outline-offset: 2px;
}
.rq-edit-title::placeholder { color: var(--text-tertiary); }
/* 富文本：上下左右撑满剩余空间（选择器对齐 RichEditor 真实类名 .rich-editor / .rich-content） */
.rq-edit-body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  display: flex;
}
.rq-edit-body :deep(.rich-editor) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.rq-edit-body :deep(.rich-content) {
  flex: 1;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}
/* 关联方案：最后一行（富文本下方、footer 上方），下拉加高便于点选 */
.rq-edit-plans {
  padding: 0 16px 12px;
  flex-shrink: 0;
}
.rq-edit-plans :deep(.el-select__wrapper) {
  min-height: 38px;
}
.rq-edit-plans :deep(.el-select__selection) {
  min-height: 34px;
}
.rq-edit-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 0.5px solid var(--border-light);
  flex-shrink: 0;
}
.pm-btn {
  border: 0.5px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.pm-btn:hover { background: var(--bg-hover); }
.pm-btn-save {
  background: var(--text);
  color: var(--bg-card);
  border-color: var(--text);
  font-weight: 600;
}
.pm-btn-save:hover { background: var(--text); opacity: 0.85; }
.pm-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
