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
        <!-- 右上角：复制 / 编辑 / 删除（图标） -->
        <span class="vcard-ops">
          <button class="vcard-op" title="复制搜索语句" @click.stop="copySearch(v)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="vcard-op" title="编辑" @click.stop="openEdit(v)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="vcard-op vcard-op-danger" title="删除" @click.stop="askDelete(v)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </span>
        <!-- 左上角：名称（两行截断；超长时用 el-tooltip 悬浮看全文） -->
        <el-tooltip :content="v.name" placement="top" :show-after="400" :disabled="v.name.length <= 26">
          <div class="vcard-name">{{ v.name }}</div>
        </el-tooltip>
        <!-- 名称下：进度条 -->
        <div class="vcard-bar"><div :style="{ width: pct(v) + '%' }"></div></div>
        <!-- 进度条下：备注 -->
        <div class="vcard-note" :class="{ 'vcard-note-long': (v.note || '').length > 20 }">{{ v.note || "无备注" }}</div>
        <!-- 底部行：左进度数字 / 右关联任务·关联方案 -->
        <div class="vcard-foot">
          <span class="vcard-count">{{ v.progress.done }}/{{ v.progress.total }}</span>
          <el-tooltip :content="relatedLine(v)" placement="top" :show-after="400" :disabled="relatedLine(v).length <= 30">
            <span class="vcard-tasks">{{ relatedLine(v) }}</span>
          </el-tooltip>
        </div>
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
      :height="560"
      :form="form"
      :rules="formRules"
      :saving="saving"
      @close="formShow = false"
      @save="saveForm"
    >
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="验证名称，如：评论功能测试" maxlength="20" show-word-limit />
      </el-form-item>
      <el-form-item label="关联任务">
        <el-select v-model="form.taskIds" multiple filterable placeholder="选择关联任务（可多选）" style="width: 100%">
          <el-option v-for="t in tasks" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="关联方案">
        <el-select v-model="form.planIds" multiple filterable placeholder="选择关联方案（可多选）" style="width: 100%">
          <el-option v-for="pl in plans" :key="pl.id" :label="pl.title" :value="pl.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注" class="form-stretch">
        <el-input v-model="form.note" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="备注信息（可选）" style="height: 100%" />
      </el-form-item>
    </FormDialog>

    <!-- 分组管理（对齐项目集管理风格：FloatPanel + 图标操作行 + 底部录入） -->
    <FloatPanel
      v-model="catShow"
      title="分组管理"
      :default-width="360"
      :default-height="380"
      :min-width="300"
      :min-height="260"
    >
      <div class="cat-body">
        <div class="cat-list">
          <div v-for="c in catList" :key="c.id" class="cat-row">
            <el-input
              v-if="catEditingId === c.id"
              v-model="catEditName"
              size="small"
              maxlength="20"
              class="cat-edit"
              @keyup.enter="saveCatRename(c)"
              @keyup.esc="cancelCatRename"
              @blur="saveCatRename(c)"
            />
            <span v-else class="cat-name">{{ c.name }}</span>
            <div class="cat-ops">
              <button class="cat-op" title="重命名" @click="startCatRename(c)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="cat-op cat-danger" title="删除（该分类下验证项归入通用）" @click="deleteCat(c)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div v-if="!catList.length" class="cat-empty">还没有分类，在下方输入名称回车新增</div>
        </div>
        <div class="cat-add">
          <el-input
            v-model="catName"
            placeholder="输入分类名称，回车立即新增"
            maxlength="20"
            clearable
            @keyup.enter="addCategory"
          />
        </div>
      </div>
    </FloatPanel>

    <!-- 验证详情弹窗（公共 FloatPanel）：卡内验证项清单 -->
    <FloatPanel
      v-model="detailShow"
      :title="detail?.name || '验证详情'"
      :default-width="720"
      :default-height="560"
      @close="detailShow = false"
    >
      <div class="vd-body" v-if="detail">
        <!-- 基础信息区：关联方案/任务/备注/进度 -->
        <div class="vd-meta">
          <div class="vd-info">
            <div class="vd-info-row" v-if="detail.planNames.length">
              <span class="vd-info-label">关联方案</span>
              <span class="vd-info-value">{{ detail.planNames.map((x) => x.name).join("、") }}</span>
            </div>
            <div class="vd-info-row" v-if="detail.taskNames.length">
              <span class="vd-info-label">关联任务</span>
              <span class="vd-info-value">{{ detail.taskNames.map((x) => x.name).join("、") }}</span>
            </div>
            <div class="vd-info-row">
              <span class="vd-info-label">备注</span>
              <span class="vd-info-value">{{ detail.note || "—" }}</span>
            </div>
            <div class="vd-info-row">
              <span class="vd-info-label">进度</span>
              <span class="vd-info-value vd-progress-num">{{ detail.progress.done }}/{{ detail.progress.total }}</span>
            </div>
          </div>
        </div>
        <div class="vd-groups">
          <div v-for="g in groupedItems" :key="g.name" class="vgroup">
            <div class="vgroup-head" @click="toggleGroup(g.name)">
              <span class="vgroup-arrow" :class="{ folded: foldedGroups.has(g.name) }">
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </span>
              <span class="vgroup-name">{{ g.name }}</span>
              <span class="vgroup-count" :class="{ 'vgroup-count-done': g.done === g.total && g.total > 0 }">{{ g.done }}/{{ g.total }}{{ g.done === g.total && g.total > 0 ? " ✓" : "" }}</span>
              <button class="vgroup-clear" title="清空本组全部验证项" @click.stop="askClearGroup(g)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
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
                    <button class="vitem-op" title="编辑" @click="startEdit(it)">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="vitem-op vitem-op-danger" title="删除" @click="askDeleteItem(it)">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>
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
      <div class="vt-input-wrap">
        <div class="vt-input-resize" title="拖动扩大输入面积" @pointerdown="onInputResizeStart"></div>
        <textarea
          ref="draftInputEl"
          v-model="draft"
          class="vt-input"
          rows="1"
          placeholder="输入验证项内容，回车即存…"
          @keydown.enter="onDraftKeydown"
        ></textarea>
      </div>
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
  searchQuery: { type: String, default: "" },
  planFilter: { type: Array, default: () => [] },
  taskFilter: { type: Array, default: () => [] },
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
/** 卡片底部：关联任务 · 关联方案（· 分隔） */
function relatedLine(v) {
  const names = [...v.taskNames.map((t) => t.name), ...v.planNames.map((pl) => pl.name)];
  return names.length ? names.join(" · ") : "未关联任务";
}

let loadSeq = 0;
async function load() {
  if (!props.projectId) return; // 项目对象未就绪（刷新恢复 tab 的瞬态）不发请求
  const seq = ++loadSeq;
  loading.value = true;
  const qs = new URLSearchParams({ page: page.value, pageSize });
  if (props.searchQuery.trim()) qs.set("keyword", props.searchQuery.trim());
  if (props.planFilter.length) qs.set("planId", props.planFilter[0]);
  if (props.taskFilter.length) qs.set("taskId", props.taskFilter[0]);
  const res = await api(`api/projects/${props.projectId}/verifications?${qs}`);
  loading.value = false;
  if (seq !== loadSeq || !res?.ok) return;
  items.value = res.data.items || [];
  total.value = res.data.total || 0;
  // 当前页超出总页数（删除后）回退一页
  if (!items.value.length && page.value > 1) { page.value = Math.max(1, Math.ceil(total.value / pageSize)); }
}
watch(() => [props.projectId, props.searchQuery, props.planFilter, props.taskFilter], () => { page.value = 1; load(); }, { immediate: true });
watch(page, load);

// ===== 新建 / 编辑（公共 FormDialog）=====
const formShow = ref(false);
const formId = ref("");
const form = reactive({ name: "", taskIds: [], planIds: [], note: "" });
const tasks = ref([]);
const saving = ref(false);

async function loadTasks() {
  const res = await api(`api/projects/${props.projectId}/tasks`);
  if (res?.ok) tasks.value = (res.data || []).filter((t) => !t.parentId);
}

// 关联方案数据源（新建/编辑弹窗）
const plans = ref([]);
async function loadPlans() {
  const res = await api(`api/projects/${props.projectId}/plans?limit=100`);
  if (res?.ok) plans.value = res.data.items || [];
}

function openCreate() {
  formId.value = "";
  form.name = "";
  form.taskIds = [];
  form.planIds = [];
  form.note = "";
  loadTasks();
  loadPlans();
  formShow.value = true;
}
// ===== 复制搜索语句（对齐任务/方案：textarea + execCommand） =====
function copyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
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
function copySearch(v) {
  copyText(`使用项目管理插件工具搜索：【验证 id:${v.id}】 【${v.name || ""}】 的具体内容。`);
}

function openEdit(v) {
  formId.value = v.id;
  form.name = v.name;
  form.taskIds = [...v.taskIds];
  form.planIds = [...v.planIds];
  form.note = v.note;
  loadTasks();
  loadPlans();
  formShow.value = true;
}

// ===== 分组管理（分类字典）=====
const catShow = ref(false);
const catList = ref([]);
const catName = ref("", );
const catEditingId = ref("");
const catEditName = ref("");

async function openCategoryManager() {
  catShow.value = true;
  await loadCategories();
}
async function loadCategories() {
  const res = await api(`api/projects/${props.projectId}/verification-categories`);
  if (res?.ok) catList.value = res.data.items || [];
}
async function addCategory() {
  const name = catName.value.trim();
  if (!name) return;
  const res = await api(`api/projects/${props.projectId}/verification-categories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (res?.ok) {
    catList.value.push(res.data);
    catName.value = "";
  } else {
    toast(res?.error || "添加失败", "error");
  }
}
function startCatRename(c) {
  catEditingId.value = c.id;
  catEditName.value = c.name;
}
function cancelCatRename() {
  catEditingId.value = "";
  catEditName.value = "";
}
async function saveCatRename(c) {
  const name = catEditName.value.trim();
  if (!name || name === c.name) return cancelCatRename();
  const res = await api(`api/projects/${props.projectId}/verification-categories/${c.id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  if (res?.ok) {
    c.name = name;
    // 同步详情内已加载验证项的分类显示（后端已同步库内同分类项）
    detailItems.value.forEach((i) => { if (i.category === catEditName.value) i.category = name; });
    cancelCatRename();
  } else {
    toast(res?.error || "重命名失败", "error");
  }
}
async function deleteCat(c) {
  const res = await api(`api/projects/${props.projectId}/verification-categories/${c.id}`, { method: "DELETE" });
  if (res?.ok) {
    catList.value = catList.value.filter((x) => x.id !== c.id);
    loadDetail();
    toast("已删除，该分类下验证项已归入通用");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}
async function saveForm() {
  const name = form.name.trim();
  if (!name) return toast("请输入验证名称", "error");
  saving.value = true;
  const body = JSON.stringify({ name, taskIds: form.taskIds, planIds: form.planIds, note: form.note.trim() });
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
const confirm = reactive({ show: false, message: "", payload: null, itemMode: false, clearMode: false });
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

// 录入下拉：分组管理字典 + 当前验证项已有分类（字典为主，不再硬编码）
const knownCategories = computed(() => {
  const set = new Set(catList.value.map((c) => c.name));
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
  loadCategories(); // 字典加载：录入下拉与分组管理共用
}
/** 搜索/跳转定位：按 id 打开验证卡详情 */
function openDetailById(id) {
  const v = items.value.find((x) => x.id === id);
  if (v) return openDetail(v);
  // 不在当前页：先拉一次（临时切到第 1 页全量找，找不到静默）
  api(`api/projects/${props.projectId}/verifications?keyword=${encodeURIComponent(id)}&pageSize=1`)
    .then((res) => {
      if (res?.ok && res.data.items?.length) openDetail(res.data.items[0]);
    });
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
    resetDraftInputHeight();
    syncCardProgress();
    emit("changed");
  } else {
    toast(res?.error || "录入失败", "error");
  }
}
// IME 选词回车不当提交
function onDraftKeydown(e) {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  addItem();
}

// 输入框拖动上边框扩大输入面积（提交后复位）
const draftInputEl = ref(null);
let draftResizing = false;
function onInputResizeStart(e) {
  e.preventDefault();
  draftResizing = true;
  const el = draftInputEl.value;
  const startY = e.clientY;
  const startH = el.offsetHeight;
  const onMove = (ev) => {
    if (!draftResizing) return;
    const h = Math.min(240, Math.max(36, startH + (startY - ev.clientY)));
    el.style.height = h + "px";
  };
  const onUp = () => {
    draftResizing = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
function resetDraftInputHeight() {
  if (draftInputEl.value) draftInputEl.value.style.height = "";
}

// 分组头批量清空
function askClearGroup(g) {
  if (!detail.value) return;
  confirm.payload = { cardId: detail.value.id, category: g.name === "通用" ? "" : g.name, name: g.name, total: g.total };
  confirm.itemMode = false;
  confirm.clearMode = true;
  confirm.message = `清空分组「${g.name}」下的全部 ${g.total} 条验证项？此操作不可恢复。`;
  confirm.show = true;
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
  const payload = confirm.payload;
  if (confirm.clearMode) {
    const res = await api(
      `api/projects/${props.projectId}/verifications/${payload.cardId}/items?category=${encodeURIComponent(payload.category)}`,
      { method: "DELETE" }
    );
    if (res?.ok) {
      toast(`已清空 ${res.data.deleted} 条`);
      loadDetail();
      emit("changed");
    } else {
      toast(res?.error || "清空失败", "error");
    }
    return;
  }
  const it = payload;
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

defineExpose({ reload: load, openCreate, openCategoryManager, openDetailById });
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
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.vcard-op:hover { color: var(--text); background: var(--bg-hover); }
.vcard-op-danger:hover { color: var(--status-delay-text); }
.vcard-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
  padding-right: 60px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.45;
  min-height: 38px;
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
.vcard-note-long { color: var(--text-secondary); }
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
  flex-shrink: 0;
}
.vd-info {
  border: 0.5px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vd-info-row {
  display: flex;
  gap: 10px;
  font-size: 12px;
  line-height: 1.6;
}
.vd-info-label {
  flex: none;
  width: 58px;
  color: var(--text-tertiary);
}
.vd-info-value {
  flex: 1;
  min-width: 0;
  color: var(--text);
  word-break: break-word;
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
.vgroup-name { font-size: 12.5px; font-weight: 500; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vgroup-count { font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; flex-shrink: 0; }
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
  word-break: break-word;
  white-space: pre-wrap;
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
.vitem-ops { flex: none; display: flex; gap: 2px; visibility: hidden; align-items: center; }
.vitem:hover .vitem-ops { visibility: visible; }
.vitem-op {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
.vtab-input input,
.vtab-input .vt-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--text);
  outline: none;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
}
/* 录入输入框：textarea + 顶部拖拽柄（评论面板同款：贴顶热区 + 横条提示） */
.vt-input {
  min-height: 36px;
  max-height: 320px;
  padding: 7px 2px;
  box-sizing: border-box;
}
.vt-input-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
}
.vt-input-resize {
  position: absolute;
  left: 0;
  right: 0;
  top: -3px;
  height: 6px;
  cursor: ns-resize;
  z-index: 2;
}
.vt-input-resize::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 2px;
  transform: translate(-50%, -50%);
  border-radius: 1px;
  background: var(--text-tertiary);
}
.vt-input-resize:hover::after { background: var(--text); }
/* 分组管理（项目集管理同款风格） */
.cat-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  box-sizing: border-box;
  min-height: 0;
  padding: 14px 16px;
}
.cat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--radius-md);
}
.cat-row:hover { background: var(--bg-hover); }
.cat-edit { flex: 1; min-width: 0; }
.cat-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-ops { display: flex; gap: 2px; flex-shrink: 0; }
.cat-op {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.cat-op:hover { background: var(--bg-hover); color: var(--text); }
.cat-danger:hover { background: #fdecec; color: var(--danger); }
.cat-empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-tertiary); }
.cat-add { display: flex; gap: 8px; flex-shrink: 0; }
/* 分组头清空按钮：常显，hover 变红 */
.vgroup-clear {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  visibility: visible;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.vgroup-clear:hover { color: var(--danger); background: var(--bg-card); }
</style>
