<template>
  <div class="req-tab">
    <!-- 详情/编辑弹窗（对齐方案弹窗：FloatPanel 阅读 7:3 + 编辑模式，无评论）
     常挂载 + v-model:show：保证 FloatPanel 从 false→true 触发居中定位，且关闭（update:show）能收回 -->
    <RequirementModal
      v-model:show="modalShow"
      :project-id="props.projectId"
      :requirement-id="modalId"
      :mode="modalMode"
      @close="modalShow = false"
      @changed="load"
    />

    <!-- 空态（对齐方案/任务：图标 + 文案 + 添加按钮） -->
    <div v-if="loading" class="reqs-empty">加载中…</div>
    <div v-else-if="!list.length" class="reqs-empty">
      <div class="reqs-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
      </div>
      <p class="reqs-empty-title">还没有需求</p>
      <p class="reqs-empty-sub">记录需求，明确项目要做的事</p>
      <button class="reqs-add reqs-add-large" @click="openCreate">
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
import { ref, computed, watch, reactive, onMounted, onBeforeUnmount } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { highlight } from "../../../utils/highlight.js";
import RequirementModal from "./RequirementModal.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";

const props = defineProps({
  projectId: { type: String, default: "" },
  searchQuery: { type: String, default: "" },
  statusQuery: { type: String, default: "全部" },
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

async function load(p = page.value, keyword = props.searchQuery, status = props.statusQuery) {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const q = new URLSearchParams({ limit: String(pageSize), offset: String((p - 1) * pageSize) });
    if (status !== "全部") q.set("status", status);
    if (keyword.trim()) q.set("keyword", keyword.trim());
    const res = await api(`api/projects/${props.projectId}/requirements?${q}`);
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
    loading.value = false;
  }
}
function goPage(p) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  load(p);
}

// 搜索关键字 / 状态变化：回到第 1 页重新查询（后端筛选）
watch(() => props.searchQuery, () => load(1));
watch(() => props.statusQuery, () => load(1));
// projectId 就绪/变化：重新拉列表（immediate 覆盖首次挂载，空 id 不发请求）
watch(() => props.projectId, () => load(), { immediate: true });

// ===== 详情/编辑弹窗（对齐方案：点击列表行预览，编辑/删除在弹窗内） =====
const modalShow = ref(false);
const modalMode = ref("read"); // read | edit
const modalId = ref(null); // null = 新建

function openCreate() {
  modalId.value = null;
  modalMode.value = "edit";
  modalShow.value = true;
}
function openDetail(r) {
  modalId.value = r.id;
  modalMode.value = "read";
  modalShow.value = true;
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
