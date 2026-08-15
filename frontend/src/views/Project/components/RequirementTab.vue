<template>
  <div class="req-tab">
    <!-- 详情/编辑弹窗（对齐方案弹窗：FloatPanel 阅读 7:3 + 编辑模式，无评论）
     常挂载 + v-model:show：保证 FloatPanel 从 false→true 触发居中定位，且关闭（update:show）能收回 -->
    <RequirementModal
      v-model:show="modalShow"
      :project-id="props.projectId"
      :requirement-id="modalId"
      :mode="modalMode"
      :can-prev="canPrev"
      :can-next="canNext"
      @close="modalShow = false"
      @changed="onModalChanged"
      @saved="onSaved"
      @created="onCreated"
      @edit-cancel="onEditCancel"
      @closed-detail="onClosedDetail"
      @mode-change="onModeChange"
      @prev="onNavigate(-1)"
      @next="onNavigate(1)"
    />

    <!-- 空态（对齐方案/任务：图标 + 文案 + 添加按钮） -->
    <div v-if="loading" class="reqs-empty">加载中…</div>
    <div v-else-if="!list.length" class="reqs-empty">
      <div class="reqs-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
      </div>
      <p class="reqs-empty-title">{{ isFiltered ? '没有匹配的需求' : '还没有需求' }}</p>
      <p class="reqs-empty-sub">{{ isFiltered ? '换个关键词或清除筛选试试' : '记录需求，明确项目要做的事' }}</p>
      <button v-if="!isFiltered" class="reqs-add reqs-add-large" @click="openCreate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>添加第一个需求</span>
      </button>
    </div>
    <div v-else class="req-list">
      <!-- 点击行打开详情预览；右键菜单：打开/编辑/删除 -->
      <div
        v-for="r in list"
        :key="r.id"
        class="req-row"
        :class="{ 'req-row-done': r.status !== '待处理' }"
        :title="r.description ? stripHtml(r.description) : ''"
        @click="openDetail(r)"
        @contextmenu.prevent="openCtx($event, r)"
      >
        <span class="req-name" v-html="highlight(r.name, searchQuery)"></span>
        <span class="req-meta">关联 {{ r.planCount }}</span>
        <span class="priority-badge" :class="`priority-${(r.priority || 'P3').toLowerCase()}`">{{ r.priority || 'P3' }}</span>
        <span class="req-st" :class="`req-st-${statusKey(r.status)}`">{{ r.status }}</span>
        <button class="req-row-copy" title="复制搜索语句" @click.stop="copyReq(r)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <!-- 分页（超过一页才显示） -->
      <div v-if="total > pageSize" class="req-pager">
        <span class="req-pager-count">共 {{ total }} 条</span>
        <div class="req-pager-btns">
          <button class="req-pager-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹ 上一页</button>
          <span class="req-pager-info">{{ page }} / {{ totalPages }}</span>
          <button class="req-pager-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页 ›</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单（fixed 定位，随鼠标；打开 / 编辑 / 删除，编辑仅待处理） -->
    <div v-if="ctx.show" class="req-ctx" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }" @click.stop>
      <div class="req-ctx-item" @click="ctxOpen">打开</div>
      <div class="req-ctx-item" @click="ctxCopyId">复制 Id</div>
      <div v-if="ctxCanEdit" class="req-ctx-item" @click="ctxEdit">编辑</div>
      <div v-if="ctx.req?.status !== '已完成'" class="req-ctx-item req-ctx-danger" @click="ctxDel">删除</div>
    </div>

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
import { highlight } from "../../../utils/highlight.js";
import RequirementModal from "./RequirementModal.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";

const props = defineProps({
  projectId: { type: String, default: "" },
  searchQuery: { type: String, default: "" },
  statusQuery: { type: String, default: "全部" },
  sortQuery: { type: String, default: "default" }, // R12：default=创建时间倒序 / priority=优先级 P0→P5
});
const emit = defineEmits(["changed"]);

function statusKey(s) {
  return { 待处理: "todo", 已完成: "done", 已取消: "cancel" }[s] || "todo";
}

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const loading = ref(false);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
// V2.2：区分「搜索/筛选无结果」与「真无数据」的空态（有筛选条件时展示搜索空态，不误报无需求）
const isFiltered = computed(() => !!props.searchQuery || props.statusQuery !== "全部");

let loadSeq = 0; // R10 列表加载竞态防护：仅最新一次请求的响应可写入
async function load(p = page.value, keyword = props.searchQuery, status = props.statusQuery, sort = props.sortQuery) {
  if (!props.projectId) return;
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const q = new URLSearchParams({ limit: String(pageSize), offset: String((p - 1) * pageSize) });
    if (status !== "全部") q.set("status", status);
    if (keyword.trim()) q.set("keyword", keyword.trim());
    if (sort && sort !== "default") q.set("sort", sort);
    const res = await api(`api/projects/${props.projectId}/requirements?${q}`);
    if (seq !== loadSeq) return; // 过期响应丢弃
    if (res?.ok) {
      list.value = res.data.items || [];
      total.value = res.data.total || 0;
      page.value = p;
      // 页码越界回退（如删除后总页数减少）
      if (page.value > totalPages.value) {
        page.value = totalPages.value;
        load(page.value);
        return;
      }
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

// ===== 详情/编辑弹窗（对齐方案：点击列表行预览，编辑/删除在弹窗内） =====
// 注意：modal 状态必须在下方 immediate watch 之前声明（immediate 同步执行 closeModal/load，靠后声明会 TDZ 报错）
const modalShow = ref(false);
const modalMode = ref("read"); // read | edit
const modalId = ref(null); // null = 新建
// V2.2 R15：记录当前编辑是否来自详情（详情内点编辑=true；列表右键编辑/新建=false）
const editingFromDetail = ref(false);

// 筛选 / 排序 / 搜索 / 项目切换：任何列表重载都关弹窗（PM 口径），再重新拉取
watch(() => props.searchQuery, () => { closeModal(); load(1); });
watch(() => props.statusQuery, () => { closeModal(); load(1); });
watch(() => props.sortQuery, () => { closeModal(); load(1); });
// projectId 就绪/变化：关弹窗（避免切项目残留 A 详情）+ 重新拉列表（immediate 覆盖首次挂载，空 id 不发请求）
watch(() => props.projectId, () => { closeModal(); load(); }, { immediate: true });

// 关弹窗并清空当前项（列表重载 / 项目切换统一走这里，避免导航基准残留）
function closeModal() {
  modalShow.value = false; // 先关，避免 requirementId 变化触发 modal 重载
  modalId.value = null;
  editingFromDetail.value = false;
}

function openCreate() {
  modalId.value = null;
  modalMode.value = "edit";
  editingFromDetail.value = false;
  modalShow.value = true;
}
function openDetail(r, globalIdx) {
  modalId.value = r.id;
  modalMode.value = "read";
  editingFromDetail.value = false;
  modalShow.value = true;
  // R10 详情切换：记录当前项在筛选结果全局序列中的索引（跨页导航基准）
  if (typeof globalIdx === "number") {
    detailGlobalIndex.value = globalIdx;
  } else {
    const idx = list.value.findIndex((x) => x.id === r.id);
    detailGlobalIndex.value = idx >= 0 ? (page.value - 1) * pageSize + idx : 0;
  }
}

// ===== R10 详情快速切换（上一条 / 下一条，跨页补拉） =====
const detailGlobalIndex = ref(0); // 当前详情项在筛选结果全局序列的索引
const pendingDelta = ref(0); // 编辑态放弃切换时暂存方向
// 导航按钮常驻显示（首/末条不隐藏，边界点击提示）
const canPrev = computed(() => modalShow.value && !!modalId.value);
const canNext = computed(() => modalShow.value && !!modalId.value);

function onNavigate(delta) {
  // 编辑态：先提示保存或放弃，确认后放弃编辑并切换
  if (modalMode.value === "edit") {
    pendingDelta.value = delta;
    confirm.value = {
      show: true,
      message: "当前处于编辑中，切换将丢失未保存的修改。放弃修改并切换？",
      confirmText: "放弃并切换",
      action: "navigate",
      req: null,
    };
    return;
  }
  doNavigate(delta);
}
// 详情内数据变化（状态流转等）：关弹窗 + 刷新列表（PM 口径：重载即关，不做位置判断）
function onModalChanged() {
  closeModal();
  load();
}

// ===== V2.2 R15：编辑保存/取消回落详情 =====
// 详情内点编辑：记录来源（新建不经过此分支，modalId 为空）
function onModeChange(mode) {
  if (mode === "edit" && modalId.value) editingFromDetail.value = true;
  modalMode.value = mode; // 对齐 PlanTab：回写 modalMode，供 onNavigate 判断编辑态弹「放弃并切换」确认
}
// 编辑保存成功：来源详情 → 回落详情（重新拉数据）；来源列表 → 关弹窗刷新列表
function onSaved(id) {
  if (editingFromDetail.value) {
    reopenDetail(id);
  } else {
    closeModal();
    load();
    emit("changed");
  }
}
// 新建保存成功：关弹窗 + 刷新列表
function onCreated() {
  closeModal();
  load();
  emit("changed");
}
// 编辑取消：来源详情 → 回落详情；来源列表 → 关弹窗
function onEditCancel() {
  if (editingFromDetail.value && modalId.value) {
    reopenDetail(modalId.value);
  } else {
    closeModal();
  }
}
// X 关闭详情弹窗：回列表刷新
function onClosedDetail() {
  editingFromDetail.value = false;
  load();
}
// 回落详情：先关（false）再 nextTick 重开（true），走完整 false→true 链路
function reopenDetail(id) {
  modalShow.value = false;
  editingFromDetail.value = false;
  nextTick(() => {
    modalId.value = id;
    modalMode.value = "read";
    modalShow.value = true;
  });
}
async function doNavigate(delta) {
  const target = detailGlobalIndex.value + delta;
  if (target < 0) { toast("到顶了！", "warn"); return; }
  if (target >= total.value) { toast("到底了！", "warn"); return; }
  const targetPage = Math.floor(target / pageSize) + 1;
  const inPage = target % pageSize;
  if (targetPage !== page.value) await load(targetPage); // 跨页补拉，load 更新 list/page
  const item = list.value[inPage];
  if (!item) return;
  openDetail(item, target);
}

// ===== 右键菜单：打开 / 编辑 / 删除（对齐方案列表） =====
const ctx = reactive({ show: false, x: 0, y: 0, req: null });
const confirm = ref({ show: false, message: "", confirmText: "确认", action: "", req: null });
const ctxCanEdit = computed(() => ctx.req && ctx.req.status === "待处理");

function openCtx(e, r) {
  ctx.req = r;
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
function copyReq(r) {
  if (!r?.id) return;
  copyText(`使用项目管理插件工具搜索：【需求 id:${r.id}】 【${r.name || ""}】 的具体内容。`);
}
function ctxCopyId() {
  if (!ctx.req?.id) return;
  const r = ctx.req;
  closeCtx();
  copyReq(r);
}
function ctxOpen() {
  closeCtx();
  openDetail(ctx.req);
}
function ctxEdit() {
  closeCtx();
  modalId.value = ctx.req.id;
  modalMode.value = "edit";
  editingFromDetail.value = false; // 列表右键编辑：非详情来源
  modalShow.value = true;
}
function ctxDel() {
  closeCtx();
  confirm.value = {
    show: true,
    message: `确认删除需求「${ctx.req.name}」？关联方案不受影响。`,
    confirmText: "删除",
    action: "delete",
    req: ctx.req,
  };
}
async function doCtxConfirm() {
  confirm.value.show = false;
  const { action, req } = confirm.value;
  if (action === "navigate") {
    // 放弃编辑并切换：openDetail 内部会切回 read 模式
    doNavigate(pendingDelta.value);
    return;
  }
  if (!req || action !== "delete") return;
  const res = await api(`api/projects/${props.projectId}/requirements/${req.id}`, { method: "DELETE" });
  if (res?.ok) {
    toast("已删除需求");
    load();
    emit("changed");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}
// 全局点击关闭右键菜单
onMounted(() => window.addEventListener("click", closeCtx));
onBeforeUnmount(() => window.removeEventListener("click", closeCtx));

// ===== 工具 =====
function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, "").slice(0, 80);
}

defineExpose({ openCreate, load });
</script>

<style scoped>
.req-tab {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== 空态（对齐方案/任务：图标 + 文案 + 添加按钮） ===== */
.reqs-empty {
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
.reqs-empty-deco {
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
.reqs-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}
.reqs-empty-sub {
  margin: 0;
  font-size: 14px;
  color: var(--text-tertiary);
}
.reqs-add {
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
.reqs-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.reqs-add.reqs-add-large {
  margin-top: 14px;
  padding: 8px 20px;
  font-size: 15px;
}

/* ===== 列表（对齐方案列表行：细分隔线 + hover 底色） ===== */
.req-list {
  display: flex;
  flex-direction: column;
}
.req-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.req-row:hover {
  background: var(--bg-hover);
}
.req-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 已完成/已取消：名称样式与待处理一致（V2.1.4 去掉删除线） */
/* 搜索关键字高亮（对齐方案/任务列表 .hl） */
.req-name :deep(.hl),
.req-name .hl {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  font-weight: 700;
  padding: 0 2px;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
/* 状态徽标（对齐方案状态标签 .plan-st：同色系染色规则） */
.req-st {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  flex-shrink: 0;
}
.req-st-todo { color: var(--status-todo-text); background: oklch(0.95 0.03 75); }
.req-st-done { color: var(--status-done-text); background: oklch(0.95 0.04 162); }
.req-st-cancel { color: var(--status-cancel-text); background: oklch(0.94 0.005 80); }
.req-row-copy {
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
.req-row-copy:hover {
  background: var(--bg-hover);
  color: var(--text);
}
/* 优先级徽标（对齐任务卡 .priority-badge：色值完全一致） */
.priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 12px;
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
/* 已完成/已取消：徽标与待处理一致（V2.1.4 去掉降透明） */
.req-meta {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 右键菜单（fixed 跟随鼠标，对齐方案列表 .plan-ctx） */
.req-ctx {
  position: fixed;
  z-index: 2100;
  min-width: 110px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
}
.req-ctx-item {
  padding: 6px 12px;
  border-radius: 5px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-out);
}
.req-ctx-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.req-ctx-danger {
  color: var(--status-delay-text);
}
.req-ctx-danger:hover {
  background: var(--status-delay-bg);
  color: var(--status-delay-text);
}

/* ===== 分页（对齐方案列表 .plan-pager） ===== */
.req-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px 0;
}
.req-pager-count {
  font-size: 13px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.req-pager-btns {
  display: flex;
  align-items: center;
  gap: 10px;
}
.req-pager-btn {
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
.req-pager-btn:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}
.req-pager-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.req-pager-info {
  font-size: 14px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
}
</style>
