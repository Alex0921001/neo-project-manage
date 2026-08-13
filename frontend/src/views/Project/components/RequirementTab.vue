<template>
  <div class="req-tab">
    <!-- 新建/编辑弹窗（配置对齐任务/备注弹窗：top label、append-to-body、点遮罩不关闭） -->
    <el-dialog
      v-model="dialogShow"
      :title="isEdit ? '编辑需求' : '新建需求'"
      width="640px"
      class="req-dialog-el"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="需求名称" prop="name">
          <el-input v-model="form.name" placeholder="需求名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="form.priority" style="width: 160px">
            <el-option v-for="p in priorityOptions" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联方案（多选，双向挂载）">
          <el-select
            v-model="form.planIds"
            multiple
            filterable
            :placeholder="plans.length ? '选择满足该需求的方案' : '项目暂无方案'"
            collapse-tags
            style="width: 100%"
          >
            <el-option v-for="pl in plans" :key="pl.id" :label="pl.title" :value="pl.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="需求简述">
          <component :is="editorComp" v-model="form.description" :project-id="projectId" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogShow = false">取消</el-button>
        <el-button class="btn-save" :loading="saving" @click="submit">{{ isEdit ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

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
      <div
        v-for="r in list"
        :key="r.id"
        class="req-row"
        :class="{ 'req-row-done': r.status !== '待处理' }"
      >
        <span class="req-name" :title="r.description ? stripHtml(r.description) : ''" v-html="highlight(r.name, searchQuery)"></span>
        <span class="req-st" :class="`req-st-${statusKey(r.status)}`">{{ r.status }}</span>
        <span class="priority-badge" :class="`priority-${(r.priority || 'P3').toLowerCase()}`">{{ r.priority || 'P3' }}</span>
        <span class="req-meta">关联方案 {{ r.planCount }} · {{ fmtTime(r.createdAt) }}</span>
        <div class="req-ops">
          <template v-if="r.status === '待处理'">
            <button class="icon-btn" title="编辑" @click="openEdit(r)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" title="标记完成" @click="changeStatus(r, '已完成')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="icon-btn" title="标记取消" @click="changeStatus(r, '已取消')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </template>
          <button class="icon-btn icon-btn-danger" title="删除" @click="remove(r)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <!-- 分页（对齐方案列表：共 N 条 + 上/下页） -->
      <div v-if="total > 0" class="req-pager">
        <span class="req-pager-count">共 {{ total }} 条</span>
        <div class="req-pager-btns">
          <button class="req-pager-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹ 上一页</button>
          <span class="req-pager-info">{{ page }} / {{ totalPages }}</span>
          <button class="req-pager-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页 ›</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { highlight } from "../../../utils/highlight.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";

const props = defineProps({
  projectId: { type: String, default: "" },
  searchQuery: { type: String, default: "" }, // index.vue 搜索框（后端筛选 + 标题高亮）
  statusQuery: { type: String, default: "全部" }, // index.vue 状态下拉（后端精确匹配）
});
const emit = defineEmits(["changed"]);

const editorComp = createRichEditor();
const priorityOptions = ["P0", "P1", "P2", "P3", "P4", "P5"];

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

// 状态 → 徽标样式 key（映射方式对齐方案 planStatusKey）
function statusKey(s) {
  return { 待处理: "todo", 已完成: "done", 已取消: "cancel" }[s] || "todo";
}

// 方案列表（关联多选数据源）
const plans = ref([]);
async function loadPlans() {
  const res = await api(`api/projects/${props.projectId}/plans?limit=100`);
  if (res?.ok) plans.value = res.data.items || [];
}

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
        load(page.value, keyword, status);
      }
    } else {
      toast(res?.error || "加载需求失败", "error");
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
watch(() => props.projectId, () => load(), { immediate: true });

// ===== 弹窗 =====
const dialogShow = ref(false);
const isEdit = ref(false);
const saving = ref(false);
const editingId = ref("");
const form = ref({ name: "", description: "", priority: "P3", planIds: [] });
const formRef = ref(null);
const rules = { name: [{ required: true, message: "请输入需求名称", trigger: "blur" }] };

function openCreate() {
  isEdit.value = false;
  editingId.value = "";
  form.value = { name: "", description: "", priority: "P3", planIds: [] };
  dialogShow.value = true;
}
function openEdit(r) {
  isEdit.value = true;
  editingId.value = r.id;
  form.value = { name: r.name, description: r.description || "", priority: r.priority || "P3", planIds: [...(r.planIds || [])] };
  dialogShow.value = true;
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  const body = { name: form.value.name, description: form.value.description, priority: form.value.priority, planIds: form.value.planIds };
  const url = `api/projects/${props.projectId}/requirements${isEdit.value ? `/${editingId.value}` : ""}`;
  const res = await api(url, { method: isEdit.value ? "PUT" : "POST", body: JSON.stringify(body) });
  saving.value = false;
  if (res?.ok) {
    toast(isEdit.value ? "已更新需求" : "已创建需求");
    dialogShow.value = false;
    load();
    emit("changed");
  } else {
    toast(res?.error || "保存失败", "error");
  }
}

async function changeStatus(r, status) {
  const res = await api(`api/projects/${props.projectId}/requirements/${r.id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  if (res?.ok) {
    toast(`已标记为「${status}」`);
    load();
    emit("changed");
  } else {
    toast(res?.error || "状态流转失败", "error");
  }
}

async function remove(r) {
  if (!confirm(`确认删除需求「${r.name}」？关联方案不受影响。`)) return;
  const res = await api(`api/projects/${props.projectId}/requirements/${r.id}`, { method: "DELETE" });
  if (res?.ok) {
    toast("已删除需求");
    load();
    emit("changed");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}

// ===== 工具 =====
function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, "").slice(0, 80);
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

defineExpose({ openCreate, load });

onMounted(() => {
  loadPlans();
});
</script>

<style scoped>
.req-tab {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 弹窗 body 内边距（对齐任务弹窗 .task-dialog-el） */
.req-dialog-el :deep(.el-dialog__body) {
  padding: 24px;
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
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.reqs-empty-sub {
  margin: 0;
  font-size: 12px;
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
  font-size: 12px;
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
  font-size: 13px;
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
  transition: background var(--duration-fast) var(--ease-out);
}
.req-row:hover {
  background: var(--bg-hover);
}
.req-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 已完成/已取消：白底保持，名称删除线 + 文字变灰（对齐任务卡 .task-done） */
.req-row-done .req-name {
  text-decoration: line-through;
  text-decoration-color: var(--border);
  text-decoration-thickness: 1.5px;
  color: var(--text-tertiary);
}
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
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  flex-shrink: 0;
}
.req-st-todo { color: var(--status-todo-text); background: oklch(0.95 0.03 75); }
.req-st-done { color: var(--status-done-text); background: oklch(0.95 0.04 162); }
.req-st-cancel { color: var(--status-cancel-text); background: oklch(0.94 0.005 80); }
/* 优先级徽标（对齐任务卡 .priority-badge：色值完全一致） */
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
/* 已完成/已取消：徽标降透明度（对齐任务卡 .task-card-done） */
.req-row-done .priority-badge {
  opacity: 0.55;
}
.req-meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
/* 操作区（对齐任务卡 .icon-btn 形态：主信息左、操作右） */
.req-ops {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
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

/* ===== 分页（对齐方案列表 .plan-pager） ===== */
.req-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px 0;
}
.req-pager-count {
  font-size: 11px;
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
  font-size: 12px;
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
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
}
</style>
