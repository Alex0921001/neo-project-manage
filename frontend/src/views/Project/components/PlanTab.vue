<template>
  <div class="plan-tab">
    <div v-if="loading" class="plans-empty">加载中…</div>
    <div v-else-if="plans.length === 0" class="plans-empty">
      <div class="plans-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 13l2 2 4-4"/></svg>
      </div>
      <p class="plans-empty-title">还没有方案</p>
      <p class="plans-empty-sub">记录方案选型，对比后一键转任务</p>
      <button class="plans-add plans-add-large" @click="openCreate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>添加第一个方案</span>
      </button>
    </div>
    <div v-else class="plan-list">
      <div
        v-for="pl in plans"
        :key="pl.id"
        class="plan-row"
        :class="{ 'plan-row-selected': selectedMap.has(pl.id) }"
        @click="openDetail(pl)"
        @contextmenu.prevent="openCtx($event, pl)"
      >
        <span
          class="plan-row-check"
          :class="{ checked: selectedMap.has(pl.id), disabled: selectedCount >= 2 && !selectedMap.has(pl.id) }"
          :title="selectedCount >= 2 && !selectedMap.has(pl.id) ? '对比最多选 2 个' : '勾选用于对比'"
          @click.stop="toggleSelect(pl)"
        >
          <svg v-if="selectedMap.has(pl.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="plan-row-title" :title="pl.title" v-html="highlight(pl.title, searchQuery)"></span>
        <span v-if="pl.taskName" class="plan-row-task" @click.stop="jumpTask(pl.taskId)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          已转任务
        </span>
        <span :class="['plan-st', `plan-st-${planStatusKey(pl.status)}`]">{{ pl.status }}</span>
        <span class="plan-row-meta">评论 {{ pl.commentCount }}</span>
        <button class="plan-row-copy" title="复制搜索语句" @click.stop="copyPlan(pl)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <!-- 分页（每页 10 条，超过一页才显示） -->
      <div v-if="total > PAGE_SIZE" class="plan-pager">
        <span class="plan-pager-count">共 {{ total }} 条</span>
        <div class="plan-pager-btns">
          <button class="plan-pager-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹ 上一页</button>
          <span class="plan-pager-info">{{ page }} / {{ totalPages }}</span>
          <button class="plan-pager-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页 ›</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单（fixed 定位，随鼠标；打开/克隆/编辑/删除/转任务，状态规则与详情一致，克隆无限制） -->
    <div v-if="ctx.show" class="plan-ctx" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }" @click.stop>
      <div class="plan-ctx-item" @click="ctxOpen">打开</div>
      <div class="plan-ctx-item" @click="ctxCopyId">复制 Id</div>
      <div class="plan-ctx-item" @click="ctxClone">克隆</div>
      <div v-if="canEdit" class="plan-ctx-item" @click="ctxEdit">编辑</div>
      <div v-if="canDel" class="plan-ctx-item plan-ctx-danger" @click="ctxDel">删除</div>
      <div v-if="canConvert" class="plan-ctx-item" @click="ctxConvert">转任务</div>
    </div>

    <PlanModal
      v-model:show="modal.show"
      :project-id="projectId"
      :plan-id="modal.planId"
      :mode="modal.mode"
      :clone-plan="modal.clonePlan"
      :can-prev="canPrev"
      :can-next="canNext"
      @mode-change="onModeChange"
      @clone="onCloneFromDetail"
      @close="modal.show = false"
      @changed="onChanged"
      @saved="onSaved"
      @created="onCreated"
      @edit-cancel="onEditCancel"
      @closed-detail="onClosedDetail"
      @jump-task="jumpTask"
      @prev="onNavigate(-1)"
      @next="onNavigate(1)"
    />
    <PlanCompareModal v-model:show="compareShow" :plans="comparePlans" />

    <ConfirmModal
      :show="confirm.show"
      :message="confirm.message"
      :confirm-text="confirm.confirmText"
      @close="confirm.show = false"
      @confirm="doCtxConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive, nextTick, onMounted, onBeforeUnmount } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { planStatusKey } from "../../../utils/planStatus.js";
import { highlight } from "../../../utils/highlight.js";
import PlanModal from "./PlanModal.vue";
import PlanCompareModal from "./PlanCompareModal.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";

const props = defineProps({
  projectId: { type: String, default: "" },
  searchQuery: { type: String, default: "" }, // 标题筛选关键字（index.vue 搜索框，后端筛选 + 高亮）
  statusQuery: { type: String, default: "全部" }, // 状态筛选（index.vue 下拉，后端精确匹配）
});
const emit = defineEmits(["changed", "jump-task"]);

const PAGE_SIZE = 10;
const plans = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
// 详情内克隆：先关闭详情弹窗，再打开预填充的新建编辑弹窗
// （show 经历 false→true 完整链路，与右击克隆行为完全一致；同 tick 替换 show 会被 Vue 合并，弹窗不会重开）
function onCloneFromDetail(p) {
  if (!p) return;
  editingFromDetail.value = false; // 详情内克隆：新建方案，非编辑已有方案
  modal.value = { ...modal.value, show: false };
  nextTick(() => {
    modal.value = { show: true, planId: null, mode: "edit", clonePlan: p };
  });
}

// 跨页勾选：id → 方案对象（分页翻页不清空，对比弹窗用完整数据）
const selectedMap = ref(new Map());
const modal = ref({ show: false, planId: null, mode: "read", clonePlan: null });
const compareShow = ref(false);
// V2.2 R15：记录当前编辑是否来自详情（详情内点编辑=true；列表右键编辑/新建=false）
// 编辑保存/取消后据此决定「回落详情」还是「关弹窗刷新列表」
const editingFromDetail = ref(false);

// 关弹窗并清空当前项（列表重载 / 项目切换统一走这里，避免导航基准残留）
function closeModal() {
  modal.value = { show: false, planId: null, mode: "read", clonePlan: null };
  editingFromDetail.value = false;
}

// ===== 右键菜单：打开 / 克隆 / 编辑 / 删除 / 转任务 =====
const ctx = reactive({ show: false, x: 0, y: 0, plan: null });
const confirm = ref({ show: false, message: "", confirmText: "确认", action: "", plan: null });
const canEdit = computed(() => ctx.plan && (ctx.plan.status === "草稿" || ctx.plan.status === "进行中"));
const canDel = computed(() => ctx.plan && (ctx.plan.status === "草稿" || ctx.plan.status === "已废弃"));
const canConvert = computed(() => ctx.plan && ctx.plan.status === "已采纳" && !ctx.plan.taskId);

function openCtx(e, pl) {
  ctx.plan = pl;
  ctx.x = Math.min(e.clientX, window.innerWidth - 140);
  ctx.y = Math.min(e.clientY, window.innerHeight - 200);
  ctx.show = true;
}
function closeCtx() {
  ctx.show = false;
}

// ===== 复制（对齐项目卡片/任务条目：textarea + execCommand） =====
function copyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
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
function copyPlan(pl) {
  if (!pl?.id) return;
  copyText(`使用项目管理插件工具搜索：【方案 id:${pl.id}】 【${pl.title || ""}】 的具体内容。`);
}
function ctxCopyId() {
  if (!ctx.plan?.id) return;
  const p = ctx.plan;
  closeCtx();
  copyPlan(p);
}
function ctxOpen() {
  closeCtx();
  openDetail(ctx.plan);
}
// 克隆：无权限控制，把当前方案标题 + 内容预填到新建编辑弹窗（保存即新建）
function ctxClone() {
  closeCtx();
  editingFromDetail.value = false; // 克隆新建：非编辑已有方案
  modal.value = { show: true, planId: null, mode: "edit", clonePlan: ctx.plan };
}
function ctxEdit() {
  closeCtx();
  editingFromDetail.value = false; // 列表右键编辑：非详情来源，保存/取消维持关弹窗现状
  modal.value = { show: true, planId: ctx.plan.id, mode: "edit", clonePlan: null };
}
function ctxDel() {
  closeCtx();
  confirm.value = { show: true, message: `确认删除方案「${ctx.plan.title}」？评论将一并删除，转出的任务不受影响。`, confirmText: "删除方案", action: "delete", plan: ctx.plan };
}
function ctxConvert() {
  closeCtx();
  confirm.value = { show: true, message: `将方案「${ctx.plan.title}」转为任务？任务名 = 方案标题，内容 = 方案内容。`, confirmText: "转任务", action: "convert", plan: ctx.plan };
}
async function doCtxConfirm() {
  confirm.value.show = false;
  const { action, plan } = confirm.value;
  if (action === "navigate") {
    // 放弃编辑并切换：openDetail 内部会切回 read 模式
    doNavigate(pendingDelta.value);
    return;
  }
  if (!plan) return;
  if (action === "delete") {
    const res = await api(`api/projects/${props.projectId}/plans/${plan.id}`, { method: "DELETE" });
    if (res?.ok) {
      toast("已删除方案");
      onChanged();
    } else toast(res?.error || "删除失败", "error");
  } else if (action === "convert") {
    const res = await api(`api/projects/${props.projectId}/plans/${plan.id}/convert`, { method: "POST" });
    if (res?.ok) {
      toast("已转为任务");
      onChanged();
    } else toast(res?.error || "转任务失败", "error");
  }
}
// 全局点击关闭右键菜单
onMounted(() => window.addEventListener("click", closeCtx));
onBeforeUnmount(() => window.removeEventListener("click", closeCtx));

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const selectedCount = computed(() => selectedMap.value.size);
// 对比数据：从跨页 Map 取完整方案（不依赖当前页）
const comparePlans = computed(() => [...selectedMap.value.values()].slice(0, 2));

let loadSeq = 0; // R10 列表加载竞态防护：仅最新一次请求的响应可写入
async function load(p = page.value, keyword = props.searchQuery, status = props.statusQuery) {
  if (!props.projectId) return;
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status && status !== "全部") params.set("status", status);
    const res = await api(`api/projects/${props.projectId}/plans?${params}`);
    if (seq !== loadSeq) return; // 过期响应丢弃
    if (res?.ok) {
      plans.value = res.data.items || [];
      total.value = res.data.total || 0;
      page.value = p;
      // 同步当前页勾选方案的实时数据（跨页项保留不动）
      const m = new Map(selectedMap.value);
      for (const pl of plans.value) {
        if (m.has(pl.id)) m.set(pl.id, { ...m.get(pl.id), ...pl });
      }
      selectedMap.value = m;
      // 页码越界回退（如删除后总页数减少）
      if (page.value > totalPages.value) {
        page.value = totalPages.value;
        load(page.value, keyword, status);
      }
    } else {
      toast(res?.error || "加载方案失败", "error");
    }
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function goPage(p) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  closeModal(); // 分页重载：关弹窗（导航基准基于旧序列，重载后失效）
  load(p);
}

// 筛选 / 搜索变化：任何列表重载都关弹窗（PM 口径），再重新拉取
watch(() => props.searchQuery, () => { closeModal(); load(1); });
watch(() => props.statusQuery, () => { closeModal(); load(1); });

function toggleSelect(pl) {
  const m = new Map(selectedMap.value);
  if (m.has(pl.id)) {
    m.delete(pl.id);
  } else {
    // 已选满 2 个：其余 checkbox 置灰，点击静默忽略
    if (m.size >= 2) return;
    m.set(pl.id, pl);
  }
  selectedMap.value = m;
}

function openDetail(pl, globalIdx) {
  modal.value = { show: true, planId: pl.id, mode: "read" };
  editingFromDetail.value = false;
  // R10 详情切换：记录当前项在筛选结果全局序列中的索引（跨页导航基准）
  if (typeof globalIdx === "number") {
    detailGlobalIndex.value = globalIdx;
  } else {
    const idx = plans.value.findIndex((x) => x.id === pl.id);
    detailGlobalIndex.value = idx >= 0 ? (page.value - 1) * PAGE_SIZE + idx : 0;
  }
}
function openCreate() {
  modal.value = { show: true, planId: null, mode: "edit" };
  editingFromDetail.value = false;
}

// V2.3 R2：按方案 ID 打开详情（全文搜索跳转；列表未加载到该条时 PlanModal 按 planId 直开）
function openDetailById(planId) {
  if (!planId) return;
  const pl = plans.value.find((x) => x.id === planId);
  if (pl) {
    openDetail(pl);
  } else {
    modal.value = { show: true, planId, mode: "read" };
    editingFromDetail.value = false;
  }
}
function openCompare() {
  if (selectedCount.value < 2) return toast("请先勾选 2 个方案", "error");
  compareShow.value = true;
}

// ===== R10 详情快速切换（上一条 / 下一条，跨页补拉） =====
const detailGlobalIndex = ref(0); // 当前详情项在筛选结果全局序列的索引
const pendingDelta = ref(0); // 编辑态放弃切换时暂存方向
// 导航按钮常驻显示（首/末条不隐藏，边界点击提示）
const canPrev = computed(() => modal.value.show && !!modal.value.planId);
const canNext = computed(() => modal.value.show && !!modal.value.planId);

function onNavigate(delta) {
  // 编辑态：先提示保存或放弃，确认后放弃编辑并切换
  if (modal.value.mode === "edit") {
    pendingDelta.value = delta;
    confirm.value = {
      show: true,
      message: "当前处于编辑中，切换将丢失未保存的修改。放弃修改并切换？",
      confirmText: "放弃并切换",
      action: "navigate",
      plan: null,
    };
    return;
  }
  doNavigate(delta);
}
async function doNavigate(delta) {
  const target = detailGlobalIndex.value + delta;
  if (target < 0) { toast("到顶了！", "warn"); return; }
  if (target >= total.value) { toast("到底了！", "warn"); return; }
  const targetPage = Math.floor(target / PAGE_SIZE) + 1;
  const inPage = target % PAGE_SIZE;
  if (targetPage !== page.value) await load(targetPage); // 跨页补拉，load 更新 plans/page
  const item = plans.value[inPage];
  if (!item) return;
  openDetail(item, target);
}

// 勾选数上报父级（右上角「对比选中」按钮联动 disabled / 计数）
watch(selectedMap, () => emit("compare-count", selectedCount.value));
function jumpTask(taskId) {
  emit("jump-task", taskId);
}
// 方案数据变更（增删改 / 转任务）：关弹窗 + 刷新方案列表 + 冒泡父级刷新项目数据（任务树等，转出的任务立即可见）
function onChanged() {
  closeModal();
  load();
  emit("changed");
}

// ===== V2.2 R15：编辑保存/取消回落详情 =====
// 详情内点编辑：mode 从 read → edit 且 planId 非空（新建不经过此分支）
function onModeChange(mode) {
  if (mode === "edit" && modal.value.planId) editingFromDetail.value = true;
  modal.value = { ...modal.value, mode };
}
// 编辑保存成功：来源详情 → 回落详情（重新拉数据）；来源列表 → 关弹窗刷新列表（现状）
function onSaved(planId) {
  if (editingFromDetail.value) {
    reopenDetail(planId);
  } else {
    closeModal();
    load();
    emit("changed");
  }
}
// 新建保存成功：关弹窗 + 刷新列表（现状）
function onCreated() {
  closeModal();
  load();
  emit("changed");
}
// 编辑取消：来源详情 → 回落详情；来源列表 → 关弹窗（现状）
function onEditCancel() {
  if (editingFromDetail.value && modal.value.planId) {
    reopenDetail(modal.value.planId);
  } else {
    closeModal();
  }
}
// X 关闭详情弹窗：回列表刷新（保存后筛选变化致该项不可见，关闭后列表重拉）
function onClosedDetail() {
  editingFromDetail.value = false;
  load();
}
// 回落详情：先关（show false）再 nextTick 重开（show true），走完整 false→true 链路，避免同 tick 合并重开失败
function reopenDetail(planId) {
  modal.value = { show: false, planId: null, mode: "read", clonePlan: null };
  editingFromDetail.value = false;
  nextTick(() => {
    modal.value = { show: true, planId, mode: "read", clonePlan: null };
  });
}

defineExpose({ openCreate, load, openCompare, openDetailById });

watch(() => props.projectId, () => { closeModal(); load(); }, { immediate: true });
</script>

<style scoped>
.plan-tab {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  padding: 5px 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.header-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}
.header-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.header-btn-primary {
  border-color: transparent;
  background: var(--accent-warm);
  color: #fff;
}
.header-btn-primary:hover:not(:disabled) {
  background: var(--accent-warm-hover);
}
.plan-empty {
  color: var(--text-tertiary);
  font-size: 15px;
  text-align: center;
  padding: 36px 0;
}
/* ===== 空态（对齐备注页） ===== */
.plans-empty {
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
.plans-empty-deco {
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
.plans-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}
.plans-empty-sub {
  margin: 0;
  font-size: 14px;
  color: var(--text-tertiary);
}
.plans-add.plans-add-large {
  margin-top: 14px;
  padding: 8px 20px;
  font-size: 15px;
}
.plans-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--text);
  color: var(--bg-card);
  border: 1px solid var(--text);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}
.plans-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.plan-list {
  display: flex;
  flex-direction: column;
}
/* 分页控件（方案列表底部，每页 10 条） */
.plan-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px 0;
}
.plan-pager-count {
  font-size: 13px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.plan-pager-btns {
  display: flex;
  align-items: center;
  gap: 10px;
}
.plan-pager-btn {
  padding: 4px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
}
.plan-pager-btn:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}
.plan-pager-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.plan-pager-info {
  font-size: 14px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
}
.plan-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--border);
  cursor: pointer;
  border-radius: 6px;
}
.plan-row:hover {
  background: var(--bg-hover);
}
.plan-row-selected {
  background: var(--accent-warm-subtle);
}
.plan-row-check {
  width: 16px;
  height: 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  background: transparent;
}
.plan-row-check.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.plan-row-check.checked {
  background: var(--accent-warm);
  border-color: var(--accent-warm);
}
.plan-row-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 搜索关键字高亮：与任务列表 TaskCard 一致（浅琥珀底 + 深琥珀字） */
.plan-row-title :deep(.hl),
.plan-row-title .hl {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  font-weight: 700;
  padding: 0 2px;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
/* 右键菜单（fixed 跟随鼠标） */
.plan-ctx {
  position: fixed;
  z-index: 2100;
  min-width: 110px;
  padding: 4px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
}
.plan-ctx-item {
  padding: 6px 12px;
  border-radius: 5px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-out);
}
.plan-ctx-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.plan-ctx-danger {
  color: var(--status-delay-text);
}
.plan-ctx-danger:hover {
  background: var(--status-delay-bg);
  color: var(--status-delay-text);
}
.plan-row-meta {
  width: 56px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-tertiary);
}
.plan-row-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.plan-row-copy:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.plan-row-task {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--status-done-text);
  flex-shrink: 0;
}
.plan-row-task:hover {
  text-decoration: underline;
}
/* 方案状态标签 */
.plan-st {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  flex-shrink: 0;
}
.plan-st-draft { color: var(--text-tertiary); background: oklch(0.94 0.005 80); }
.plan-st-doing { color: var(--status-doing-text); background: oklch(0.95 0.03 255); }
.plan-st-done { color: var(--status-done-text); background: oklch(0.95 0.04 162); }
.plan-st-abandoned { color: var(--status-delay-text); background: oklch(0.95 0.03 25); }
</style>
