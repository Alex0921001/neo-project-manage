<template>
  <div class="req-tab">
    <!-- 新建/编辑弹窗 -->
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

    <div class="req-toolbar">
      <div class="req-search">
        <svg class="req-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="keyword" class="req-search-input" placeholder="搜索需求" @keyup.enter="load" />
      </div>
      <el-select v-model="statusFilter" class="req-status-select" size="small" style="width: 110px" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <div class="req-toolbar-spacer"></div>
      <button class="header-btn header-btn-primary" @click="openCreate">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建需求
      </button>
    </div>

    <div class="req-list">
      <div v-if="loading" class="req-empty">加载中...</div>
      <div v-else-if="!list.length" class="req-empty">暂无需求</div>
      <div v-for="r in list" :key="r.id" class="req-row" :class="{ 'req-row-done': r.status !== '待处理' }">
        <div class="req-main">
          <span class="req-name" :title="r.description ? stripHtml(r.description) : ''">{{ r.name }}</span>
          <span class="req-badge req-status" :class="`st-${r.status}`">{{ r.status }}</span>
          <span class="req-badge req-priority" :class="`prio-${r.priority || 'P3'}`">{{ r.priority || 'P3' }}</span>
          <span class="req-meta">关联方案 {{ r.planCount }} · {{ fmtTime(r.createdAt) }}</span>
        </div>
        <div class="req-ops">
          <template v-if="r.status === '待处理'">
            <button class="req-op" @click="openEdit(r)">编辑</button>
            <button class="req-op" @click="changeStatus(r, '已完成')">✓ 完成</button>
            <button class="req-op" @click="changeStatus(r, '已取消')">取消</button>
          </template>
          <button class="req-op req-op-danger" @click="remove(r)">删除</button>
        </div>
      </div>
    </div>

    <div v-if="total > pageSize" class="req-pager">
      <button class="req-page-btn" :disabled="page === 1" @click="page--; load()">上一页</button>
      <span class="req-page-info">{{ page }} / {{ totalPages }}</span>
      <button class="req-page-btn" :disabled="page >= totalPages" @click="page++; load()">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";

const props = defineProps({
  projectId: { type: String, default: "" },
});
const emit = defineEmits(["changed"]);

const editorComp = createRichEditor();
const priorityOptions = ["P0", "P1", "P2", "P3", "P4", "P5"];
const statusOptions = ["全部", "待处理", "已完成", "已取消"];

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref("");
const statusFilter = ref("全部");
const loading = ref(false);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

// 方案列表（关联多选数据源）
const plans = ref([]);
async function loadPlans() {
  const res = await api(`api/projects/${props.projectId}/plans?limit=100`);
  if (res?.ok) plans.value = res.data.items || [];
}

async function load() {
  if (!props.projectId) return;
  loading.value = true;
  const q = new URLSearchParams({ limit: String(pageSize), offset: String((page.value - 1) * pageSize) });
  if (statusFilter.value !== "全部") q.set("status", statusFilter.value);
  if (keyword.value.trim()) q.set("keyword", keyword.value.trim());
  const res = await api(`api/projects/${props.projectId}/requirements?${q}`);
  loading.value = false;
  if (res?.ok) {
    list.value = res.data.items || [];
    total.value = res.data.total || 0;
  } else {
    toast(res?.error || "加载需求失败", "error");
  }
}

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

onMounted(() => {
  load();
  loadPlans();
});
</script>

<style scoped>
.req-tab { padding: 4px 2px; }
.req-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.req-search { position: relative; display: flex; align-items: center; }
.req-search-icon { position: absolute; left: 8px; color: var(--text-tertiary); }
.req-search-input {
  width: 200px;
  height: 30px;
  padding: 0 10px 0 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
}
.req-search-input:focus { border-color: var(--accent); }
.req-toolbar-spacer { flex: 1; }
.req-list { display: flex; flex-direction: column; gap: 6px; }
.req-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  transition: opacity var(--duration-fast) var(--ease-out);
}
.req-row-done { opacity: 0.65; }
.req-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.req-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.req-row-done .req-name { text-decoration: line-through; }
.req-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}
.req-status.st-待处理 { background: var(--bg-hover); color: var(--text-secondary); }
.req-status.st-已完成 { background: var(--status-ok-bg, rgba(46, 160, 67, 0.12)); color: var(--status-ok-text, #2ea043); }
.req-status.st-已取消 { background: var(--bg-hover); color: var(--text-tertiary); }
.req-priority.prio-P0 { color: #d93838; }
.req-priority.prio-P1 { color: #e07b1a; }
.req-priority.prio-P2 { color: #2f6fe4; }
.req-priority.prio-P3 { color: var(--text-secondary); }
.req-priority.prio-P4, .req-priority.prio-P5 { color: var(--text-tertiary); }
.req-meta { font-size: 11px; color: var(--text-tertiary); }
.req-ops { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.req-op {
  padding: 4px 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.req-op:hover { background: var(--bg-hover); color: var(--text); }
.req-op-danger:hover { color: var(--status-delay-text); border-color: currentColor; }
.req-empty { padding: 60px 20px; text-align: center; color: var(--text-tertiary); font-size: 13px; }
.req-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; }
.req-page-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.req-page-btn:disabled { opacity: 0.35; cursor: default; }
.req-page-info { font-size: 12px; color: var(--text-secondary); }
</style>
