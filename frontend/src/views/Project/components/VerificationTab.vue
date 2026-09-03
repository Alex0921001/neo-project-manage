<template>
  <div class="vtab">
    <!-- ===== 卡片列表页 ===== -->
    <div class="vtab-cards">
      <div v-if="loading" class="vempty">加载中…</div>
      <div v-else-if="!items.length" class="vempty">
        <div class="vempty-deco">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </div>
        <p class="vempty-title">还没有验证记录</p>
        <p class="vempty-sub">为功能测试建一张验证卡，逐项打勾记录验收进度</p>
        <button class="vempty-add" @click="openCreate">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>添加第一个验证</span>
        </button>
      </div>
      <div v-for="v in items" :key="v.id" class="vcard" @click="openDetail(v)">
        <!-- 右上角：编辑 / 删除 -->
        <span class="vcard-ops">
          <button class="vcard-op" title="编辑" @click.stop="openEdit(v)">编辑</button>
          <button class="vcard-op vcard-op-danger" title="删除" @click.stop="askDelete(v)">删除</button>
        </span>
        <!-- 左上角：名称 -->
        <div class="vcard-name" :title="v.name">{{ v.name }}</div>
        <!-- 名称下：进度条 -->
        <div class="vcard-bar"><div :style="{ width: pct(v) + '%' }"></div></div>
        <!-- 进度条下：备注 -->
        <div class="vcard-note" :title="v.note || ''">{{ v.note || "无备注" }}</div>
        <!-- 底部行：左进度数字 / 右关联任务 -->
        <div class="vcard-foot">
          <span class="vcard-count">{{ v.progress.done }}/{{ v.progress.total }}</span>
          <span class="vcard-tasks" :title="v.taskNames.map((t) => t.name).join('、')">
            {{ v.taskNames.length ? v.taskNames.map((t) => t.name).join("、") : "未关联任务" }}
          </span>
        </div>
      </div>
      <div v-if="!items.length && !loading" class="vtab-empty">
        <p class="vtab-empty-title">还没有验证记录</p>
        <p class="vtab-empty-sub">点击右上角「新建验证」，为功能测试建一张验证卡</p>
      </div>
    </div>
    <div v-if="total > pageSize" class="vtab-pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        background
        small
      />
    </div>

    <!-- 新建 / 编辑验证（公共 FormDialog）：名称 + 关联任务 + 备注（自适应填充） -->
    <FormDialog
      v-model:show="formShow"
      :title="formId ? '编辑验证' : '新建验证'"
      :width="440"
      :height="480"
      :form="form"
      :rules="formRules"
      :saving="saving"
      @close="formShow = false"
      @save="saveForm"
    >
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="验证名称，如：评论功能测试" maxlength="60" />
      </el-form-item>
      <el-form-item label="关联任务">
        <el-select v-model="form.taskIds" multiple filterable placeholder="选择关联任务（可多选）" style="width: 100%">
          <el-option v-for="t in tasks" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注" class="form-stretch">
        <el-input v-model="form.note" type="textarea" :rows="3" placeholder="备注信息（可选）" style="height: 100%" />
      </el-form-item>
    </FormDialog>

    <!-- 验证详情弹窗（公共 FloatPanel）：卡内验证项清单 -->
    <FloatPanel
      v-model="detailShow"
      :title="detail?.name || '验证详情'"
      :default-width="720"
      :default-height="560"
      @close="detailShow = false"
    >
      <div class="vd-body" v-if="detail">
        <div class="vd-meta">
          <span class="vd-progress-num">{{ detail.progress.done }}/{{ detail.progress.total }}</span>
          <div class="vd-progress-bar"><div :style="{ width: pct(detail) + '%' }"></div></div>
        </div>
        <div class="vd-groups">
          <div v-for="g in groupedItems" :key="g.name" class="vgroup">
            <div class="vgroup-head" @click="toggleGroup(g.name)">
              <span class="vgroup-arrow" :class="{ folded: foldedGroups.has(g.name) }">
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </span>
              <span class="vgroup-name">{{ g.name }}</span>
              <span class="vgroup-count" :class="{ 'vgroup-count-done': g.done === g.total && g.total > 0 }">{{ g.done }}/{{ g.total }}{{ g.done === g.total && g.total > 0 ? " ✓" : "" }}</span>
            </div>
            <div v-show="!foldedGroups.has(g.name)" class="vgroup-body">
              <div v-for="it in g.items" :key="it.id" class="vitem">
                <button
                  class="vitem-check"
                  :class="{ done: it.status }"
                  :title="it.status ? '点击退回（会写入审计）' : '点击通过（会写入审计）'"
                  @click="toggleItem(it)"
                >
                  <svg v-if="it.status" width="10" height="10" viewBox="0 0 12 12"><path d="M2.5 6.2 L5 8.8 L9.5 3.5" fill="none" stroke="#FFFDF7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <template v-if="editingId === it.id">
                  <input v-model="editDraft" class="vitem-edit" @keydown.enter.prevent="saveEdit(it)" @keydown.esc="cancelEdit" />
                  <button class="vitem-op" @click="saveEdit(it)">保存</button>
                  <button class="vitem-op" @click="cancelEdit">取消</button>
                </template>
                <template v-else>
                  <span class="vitem-content" :class="{ done: it.status }">{{ it.content }}</span>
                  <span v-if="it.note" class="vitem-note" :title="it.note">备注: {{ it.note }}</span>
                  <span v-if="it.status && it.checkedAt" class="vitem-time">{{ fmtTime(it.checkedAt) }}</span>
                  <span class="vitem-ops">
                    <button class="vitem-op" @click="startEdit(it)">编辑</button>
                    <button class="vitem-op vitem-op-danger" @click="askDeleteItem(it)">删除</button>
                  </span>
                </template>
              </div>
            </div>
          </div>
      <div v-if="!items.length && !loading" class="vtab-empty">该对象还没有验证项，在下方录入</div>
    </div>
    <div class="vtab-input">
      <el-select v-model="draftCategory" filterable allow-create default-first-option size="small" placeholder="类别" style="width: 130px">
        <el-option v-for="c in knownCategories" :key="c" :label="c" :value="c" />
      </el-select>
      <input v-model="draft" placeholder="输入验证项内容，回车即存…" @keydown.enter="addItem" />
    </div>
      </div>
    </FloatPanel>

    <ConfirmModal
      :show="confirm.show"
      :message="confirm.message"
      confirm-text="删除"
      @close="confirm.show = false"
      @confirm="doConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import ConfirmModal from "../../../components/ConfirmModal.vue";
import FormDialog from "../../../components/FormDialog.vue";
import FloatPanel from "../../../components/FloatPanel.vue";

const props = defineProps({
  projectId: { type: String, required: true },
});
const emit = defineEmits(["changed"]);

// ===== 卡片列表 =====
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const summaryDone = computed(() => items.value.reduce((n, v) => n + v.progress.done, 0));
const summaryTotal = computed(() => items.value.reduce((n, v) => n + v.progress.total, 0));
const progressPct = computed(() => (summaryTotal.value ? Math.round((summaryDone.value / summaryTotal.value) * 100) : 0));

function pct(v) {
  return v.progress.total ? Math.round((v.progress.done / v.progress.total) * 100) : 0;
}

let loadSeq = 0;
async function load() {
  if (!props.projectId) return; // 项目对象未就绪（刷新恢复 tab 的瞬态）不发请求
  const seq = ++loadSeq;
  loading.value = true;
  const res = await api(`api/projects/${props.projectId}/verifications?page=${page.value}&pageSize=${pageSize}`);
  loading.value = false;
  if (seq !== loadSeq || !res?.ok) return;
  items.value = res.data.items || [];
  total.value = res.data.total || 0;
  // 当前页超出总页数（删除后）回退一页
  if (!items.value.length && page.value > 1) { page.value = Math.max(1, Math.ceil(total.value / pageSize)); }
}
watch(() => props.projectId, () => { page.value = 1; load(); }, { immediate: true });
watch(page, load);

// ===== 新建 / 编辑（公共 FormDialog）=====
const formShow = ref(false);
const formId = ref("");
const form = reactive({ name: "", taskIds: [], note: "" });
const tasks = ref([]);
const saving = ref(false);

async function loadTasks() {
  const res = await api(`api/projects/${props.projectId}/tasks`);
  if (res?.ok) tasks.value = (res.data || []).filter((t) => !t.parentId);
}

function openCreate() {
  formId.value = "";
  form.name = "";
  form.taskIds = [];
  form.note = "";
  loadTasks();
  formShow.value = true;
}
function openEdit(v) {
  formId.value = v.id;
  form.name = v.name;
  form.taskIds = [...v.taskIds];
  form.note = v.note;
  loadTasks();
  formShow.value = true;
}
async function saveForm() {
  const name = form.name.trim();
  if (!name) return toast("请输入验证名称", "error");
  saving.value = true;
  const body = JSON.stringify({ name, taskIds: form.taskIds, note: form.note.trim() });
  const res = formId.value
    ? await api(`api/projects/${props.projectId}/verifications/${formId.value}`, { method: "PUT", body })
    : await api(`api/projects/${props.projectId}/verifications`, { method: "POST", body });
  saving.value = false;
  if (res?.ok) {
    formShow.value = false;
    toast(formId.value ? "已更新验证" : "已创建验证");
    load();
    emit("changed");
  } else {
    toast(res?.error || "保存失败", "error");
  }
}

// ===== 删除卡 =====
const confirm = reactive({ show: false, message: "", payload: null });
function askDelete(v) {
  confirm.payload = v;
  confirm.itemMode = false;
  confirm.message = `删除验证「${v.name}」？卡内验证项将一并删除。`;
  confirm.show = true;
}

// ===== 详情弹窗（验证项清单）=====
const detailShow = ref(false);
const detail = ref(null);
const detailItems = ref([]);
const draft = ref("");
const draftCategory = ref("功能验证");
const editingId = ref("");
const editDraft = ref("");
const foldedGroups = ref(new Set());

const knownCategories = computed(() => {
  const set = new Set(["功能验证", "边界与异常", "回归验证"]);
  detailItems.value.forEach((i) => i.category && set.add(i.category));
  return [...set];
});
const groupedItems = computed(() => {
  const map = new Map();
  for (const it of detailItems.value) {
    const name = it.category || "通用";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(it);
  }
  return [...map.entries()].map(([name, list]) => ({
    name,
    items: list,
    total: list.length,
    done: list.filter((i) => i.status).length,
  }));
});

function openDetail(v) {
  detail.value = v;
  detailShow.value = true;
  foldedGroups.value = new Set();
  loadDetail();
}
async function loadDetail() {
  if (!detail.value) return;
  const res = await api(`api/projects/${props.projectId}/verifications/${detail.value.id}/items`);
  if (res?.ok) detailItems.value = res.data.items || [];
  // 同步卡片进度
  const card = items.value.find((x) => x.id === detail.value.id);
  if (card) {
    card.progress.done = detailItems.value.filter((i) => i.status).length;
    card.progress.total = detailItems.value.length;
  }
}
function toggleGroup(name) {
  const next = new Set(foldedGroups.value);
  next.has(name) ? next.delete(name) : next.add(name);
  foldedGroups.value = next;
}
function fmtTime(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function addItem() {
  const content = draft.value.trim();
  if (!content) return;
  const res = await api(`api/projects/${props.projectId}/verifications/${detail.value.id}/items`, {
    method: "POST",
    body: JSON.stringify({ content, category: draftCategory.value || "" }),
  });
  if (res?.ok) {
    detailItems.value.push(res.data);
    draft.value = "";
    syncCardProgress();
    emit("changed");
  } else {
    toast(res?.error || "录入失败", "error");
  }
}
function syncCardProgress() {
  const card = items.value.find((x) => x.id === detail.value?.id);
  if (card) {
    card.progress.done = detailItems.value.filter((i) => i.status).length;
    card.progress.total = detailItems.value.length;
  }
}

async function toggleItem(it) {
  const prev = it.status;
  it.status = !prev;
  const res = await api(`api/projects/${props.projectId}/verifications/items/${it.id}/toggle`, { method: "POST" });
  if (res?.ok) {
    Object.assign(it, res.data);
    syncCardProgress();
  } else {
    it.status = prev;
    toast(res?.error || "操作失败", "error");
  }
}

function startEdit(it) {
  editingId.value = it.id;
  editDraft.value = it.content;
}
function cancelEdit() {
  editingId.value = "";
  editDraft.value = "";
}
async function saveEdit(it) {
  const content = editDraft.value.trim();
  if (!content) return;
  const res = await api(`api/projects/${props.projectId}/verifications/items/${it.id}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
  if (res?.ok) {
    Object.assign(it, res.data);
    cancelEdit();
  } else {
    toast(res?.error || "保存失败", "error");
  }
}
function askDeleteItem(it) {
  confirm.payload = it;
  confirm.itemMode = true;
  confirm.message = `删除验证项「${it.content.slice(0, 30)}」？`;
  confirm.show = true;
}
async function doConfirm() {
  confirm.show = false;
  const it = confirm.payload;
  if (confirm.itemMode) {
    const res = await api(`api/projects/${props.projectId}/verifications/items/${it.id}`, { method: "DELETE" });
    if (res?.ok) {
      detailItems.value = detailItems.value.filter((x) => x.id !== it.id);
      syncCardProgress();
      toast("已删除");
    } else {
      toast(res?.error || "删除失败", "error");
    }
    return;
  }
  const v = it;
  const res = await api(`api/projects/${props.projectId}/verifications/${v.id}`, { method: "DELETE" });
  if (res?.ok) {
    toast("已删除验证");
    load();
    emit("changed");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}

defineExpose({ reload: load, openCreate });
</script>

<style scoped>
.vtab {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  box-sizing: border-box;
}
.vtab-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.vtab-progress {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}
.vtab-progress-bar {
  flex: 1;
  max-width: 320px;
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}
.vtab-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width var(--duration-normal) var(--ease-out);
}
.vtab-progress-num {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.vtab-new-btn {
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent-light);
  color: var(--accent-hover);
  font-size: 12px;
  font-weight: 500;
  padding: 5px 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.vtab-new-btn:hover { background: var(--accent); color: #fff; }

/* 卡片网格 */
.vtab-cards {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  align-content: start;
}
.vcard {
  position: relative;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.vcard:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); }
.vcard-ops {
  position: absolute;
  top: 8px;
  right: 10px;
  display: flex;
  gap: 4px;
  visibility: hidden;
}
.vcard:hover .vcard-ops { visibility: visible; }
.vcard-op {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.vcard-op:hover { color: var(--text); background: var(--bg-hover); }
.vcard-op-danger:hover { color: var(--status-delay-text); }
.vcard-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
  padding-right: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcard-bar {
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}
.vcard-bar > div {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width var(--duration-normal) var(--ease-out);
}
.vcard-note {
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-height: 15px;
}
.vcard-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 8px;
}
.vcard-count {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.vcard-tasks {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vtab-pager {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
/* 空态（对齐方案列表） */
.vempty {
  grid-column: 1 / -1;
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
.vempty-deco {
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
.vempty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}
.vempty-sub {
  margin: 0;
  font-size: 14px;
  color: var(--text-tertiary);
}
.vempty-add {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 20px;
  background: var(--text);
  color: var(--bg-card);
  border: 1px solid var(--text);
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}
.vempty-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--bg-card);
}

/* 详情弹窗内清单 */
.vd-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  padding: 14px 16px;
}
.vd-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.vd-progress-num {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.vd-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}
.vd-progress-bar > div {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
}
.vd-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vgroup-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 5px;
  cursor: pointer;
}
.vgroup-arrow {
  display: inline-flex;
  color: var(--text-tertiary);
  transition: transform var(--duration-fast) var(--ease-out);
}
.vgroup-arrow.folded { transform: rotate(-90deg); }
.vgroup-name { font-size: 12.5px; font-weight: 500; color: var(--text); }
.vgroup-count {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.vgroup-count-done { color: var(--status-done-text); }
.vgroup-body {
  border: 0.5px solid var(--border-light);
  border-top: none;
  border-radius: 0 0 5px 5px;
  background: var(--bg-card);
}
.vitem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--border-light);
}
.vitem:last-child { border-bottom: none; }
.vitem-check {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--border);
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.vitem-check:hover { border-color: var(--accent); }
.vitem-check.done { background: var(--accent); border-color: var(--accent); }
.vitem-content {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
}
.vitem-content.done {
  color: var(--text-tertiary);
  text-decoration: line-through;
  text-decoration-color: rgba(154, 145, 134, 0.5);
}
.vitem-note {
  flex: none;
  font-size: 10px;
  color: var(--accent-warm-hover);
  background: var(--accent-warm-subtle);
  border-radius: 8px;
  padding: 1px 7px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vitem-time {
  flex: none;
  font-size: 10px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.vitem-ops { flex: none; display: flex; gap: 2px; visibility: hidden; }
.vitem:hover .vitem-ops { visibility: visible; }
.vitem-op {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 4px;
}
.vitem-op:hover { color: var(--text); background: var(--bg-hover); }
.vitem-op-danger:hover { color: var(--status-delay-text); }
.vitem-edit {
  flex: 1;
  min-width: 0;
  border: 0.5px solid var(--border);
  border-radius: 5px;
  font-size: 12.5px;
  padding: 4px 8px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
}
.vitem-edit:focus { border-color: var(--text); }
.vtab-input {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.vtab-input input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--text);
  outline: none;
}
</style>
