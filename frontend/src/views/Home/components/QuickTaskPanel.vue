<template>
  <div class="qtp-wrap">
    <div class="qtp-paper">
      <!-- 左侧装订孔 + 撕口 -->
      <div class="qtp-gutter qtp-gutter-left">
        <div class="qtp-holes"><span v-for="i in 7" :key="'l'+i" class="qtp-hole"></span></div>
        <div class="qtp-tear"></div>
      </div>

      <!-- 标题区 -->
      <div class="qtp-head">
        <span class="qtp-title">临时任务</span>
        <button class="qtp-refresh" title="刷新" @click="refresh">
          <svg :class="{ spinning: refreshing }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
      <div class="qtp-sub">随手记 · 想到什么写什么，回车即存 · Shift + 回车换行</div>

      <!-- 未完成列表（横格线，带序号；末尾固定空行，点击输入） -->
      <div class="qtp-lines">
        <div
          v-for="(t, idx) in activeList"
          :key="t.id"
          class="qtp-line-row"
          @click="startEdit(t, $event)"
        >
          <template v-if="editId === t.id">
            <span class="qtp-idx">{{ idx + 1 }}.</span>
            <textarea
              ref="editInput"
              v-model="editText"
              class="qtp-edit-input"
              rows="1"
              @click.stop
              @keydown.enter.exact.prevent="saveEdit(t.id)"
              @keydown.esc="cancelEdit"
              @blur="onEditBlur(t)"
              @input="fitEditHeight"
            ></textarea>
          </template>
          <template v-else>
            <span class="qtp-idx">{{ idx + 1 }}.</span>
            <div class="qtp-line-content">
              <span class="qtp-text">{{ t.content }}</span>
              <span class="qtp-ops" @click.stop>
                <button class="qtp-act qtp-green" @click.stop="markDone(t)">【完成】</button>
                <button class="qtp-act qtp-green" @click.stop="openConvert(t)">【转正式】</button>
              </span>
            </div>
          </template>
        </div>
        <!-- 列表末尾固定空行：点击该行出现输入框 -->
        <div
          v-if="!inlineInput"
          class="qtp-line-row qtp-newline-row"
          title="点击输入"
          @click="startInline"
        ></div>
        <!-- 新增输入行（点击末尾空行后原位出现）：多行输入，shift+回车换行 -->
        <div v-else class="qtp-line-row qtp-inline-row">
          <span class="qtp-idx">{{ activeList.length + 1 }}.</span>
          <textarea
            ref="inlineInputRef"
            v-model="inputText"
            class="qtp-edit-input qtp-new-input"
            rows="1"
            placeholder="想到什么写什么…"
            @keydown.enter.exact.prevent="addTask"
            @keydown.esc="hideInline"
            @blur="onInlineBlur"
            @input="fitEditHeight"
          ></textarea>
        </div>
      </div>

      <!-- 已完成折叠区 -->
      <div class="qtp-fold" :class="{ open: foldOpen }">
        <div class="qtp-fold-head" @click="foldOpen = !foldOpen">
          <span class="qtp-arrow">▶</span>
          <span>已完成<span class="qtp-count-tag">{{ doneList.length }}</span></span>
          <span class="qtp-btns" @click.stop>
            <button class="qtp-act" @click="archiveAll">【全部归档】</button>
            <button class="qtp-act qtp-green" @click="openArchive">【已归档({{ archTotal }})】</button>
          </span>
        </div>
        <div class="qtp-fold-body">
          <div
            v-for="(t, idx) in doneList"
            :key="t.id"
            class="qtp-done-row"
          >
            <span class="qtp-idx">{{ idx + 1 }}.</span>
            <div class="qtp-line-content">
              <span class="qtp-done-text">{{ t.content }}</span>
              <span class="qtp-ops">
                <button v-if="t.status === 'done'" class="qtp-act" @click.stop="reopenTask(t)">【退回】</button>
                <button v-if="t.status === 'done'" class="qtp-act qtp-green" @click.stop="openConvert(t)">【转正式】</button>
                <button class="qtp-act" @click.stop="archiveOne(t)">【归档】</button>
              </span>
            </div>
            <span v-if="t.status === 'converted'" class="qtp-conv-tag" title="打开目标项目" @click="goProject(t)">→ {{ t.convertedProject }}</span>
          </div>
          <div v-if="!doneList.length" class="qtp-empty">空空如也</div>
        </div>
      </div>

      <!-- 底部脚注 -->
      <div class="qtp-foot">当前共记 {{ tasks.length }} 条，未完成 {{ activeList.length }} 条</div>
    </div>

    <!-- 转正式任务弹窗（公共 FormDialog） -->
    <FormDialog
      v-model:show="convShow"
      title="转为正式任务"
      :width="480"
      :height="420"
      :form="convForm"
      :rules="convRules"
      :saving="convSaving"
      save-text="确定转正式"
      @update:show="(v) => { if (!v) convShow = false }"
      @cancel="convShow = false"
      @save="doConvert"
    >
      <el-form-item label="目标项目" prop="projectId">
        <el-select v-model="convForm.projectId" filterable placeholder="请选择项目（排除已归档）" style="width: 100%">
          <el-option v-for="p in projectOptions" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="任务名称" prop="name">
        <el-input v-model="convForm.name" maxlength="200" placeholder="任务名称" />
      </el-form-item>
      <el-form-item label="优先级">
        <el-select v-model="convForm.priority" style="width: 100%">
          <el-option v-for="p in ['P0','P1','P2','P3','P4','P5']" :key="p" :label="p" :value="p" />
        </el-select>
      </el-form-item>
    </FormDialog>

    <!-- 删除二次确认（WebView 环境不支持 window.confirm，用公共 ConfirmModal） -->
    <ConfirmModal
      :show="delConfirm.show"
      :message="delConfirm.message"
      confirm-text="确认删除"
      @close="delConfirm.show = false"
      @confirm="doConfirmDelete"
    />

    <!-- 已归档弹窗（公共 FloatPanel，纸感） -->
    <FloatPanel v-model="archShow" title="已归档的临时任务" :default-width="660" :default-height="520">
      <div class="qtp-arch-body">
        <div class="qtp-searchrow">
          <el-input
            v-model="archKeyword"
            placeholder="按内容模糊搜索…"
            clearable
            :prefix-icon="SearchIcon"
            @input="onArchSearch"
          />
          <button class="qtp-act qtp-red qtp-act-lg" @click="deleteAllArch">【删除全部】</button>
        </div>
        <table class="qtp-table">
          <thead>
            <tr><th>内容</th><th>完成时间</th><th>归档时间</th><th>转化去向</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in archItems" :key="t.id">
              <td class="qtp-c-main">{{ t.content }}</td>
              <td class="qtp-c-time">{{ fmtTime(t.doneAt) }}</td>
              <td class="qtp-c-time">{{ fmtTime(t.archivedAt) }}</td>
              <td>
                <span v-if="t.convertedProject" class="qtp-link">→ {{ t.convertedProject }}</span>
                <span v-else>—</span>
              </td>
              <td><button class="qtp-act qtp-red" @click="deleteArch(t)">【删除】</button></td>
            </tr>
            <tr v-if="!archItems.length">
              <td colspan="5" class="qtp-empty">无匹配数据</td>
            </tr>
          </tbody>
        </table>
        <div class="qtp-pager">
          <span class="qtp-arch-total">共 {{ archTotal }} 条（后端分页 · 每页 {{ archPageSize }} 条）</span>
          <button :disabled="archPage <= 1" @click="archGo(archPage - 1)">‹</button>
          <button
            v-for="p in archPages"
            :key="p"
            :class="{ cur: p === archPage }"
            @click="archGo(p)"
          >{{ p }}</button>
          <button :disabled="archPage >= archPages" @click="archGo(archPage + 1)">›</button>
        </div>
      </div>
    </FloatPanel>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from "vue";
import { Search as SearchIcon } from "@element-plus/icons-vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import FormDialog from "../../../components/FormDialog.vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";

const emit = defineEmits(["open-project", "changed"]);

// ===== 数据 =====
const tasks = ref([]);
const inputText = ref("");
const inlineInput = ref(false);
const inlineInputRef = ref(null);
const editId = ref(null);
const editText = ref("");
const foldOpen = ref(false);

const activeList = computed(() => tasks.value.filter((t) => t.status === "active"));
const doneList = computed(() => tasks.value.filter((t) => t.status === "done" || t.status === "converted"));

async function load() {
  const res = await api("api/quick-tasks");
  if (res?.ok) {
    tasks.value = res.data || [];
  }
}
function fmtTime(iso) {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

// ===== 刷新 =====
const refreshing = ref(false);
async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await Promise.all([load(), loadArchCount()]);
  } finally {
    refreshing.value = false;
  }
}

// ===== 新增（点击末尾固定空行触发） =====
function startInline() {
  cancelEdit(); // 编辑态与新增行互斥
  inlineInput.value = true;
  nextTick(() => inlineInputRef.value?.focus());
}
function hideInline() {
  inlineInput.value = false;
  inputText.value = "";
}
// blur 且无内容时才收起（回车添加后保持可连续输入）
function onInlineBlur() {
  setTimeout(() => {
    if (inlineInput.value && !inputText.value.trim()) hideInline();
  }, 120);
}

// ===== 新增 =====
async function addTask() {
  const v = inputText.value.trim();
  if (!v) return;
  const res = await api("api/quick-tasks", { method: "POST", body: JSON.stringify({ content: v }) });
  if (res?.ok) {
    inputText.value = "";
    nextTick(() => {
      // 复位输入框高度，保持可连续记录
      if (inlineInputRef.value) fitEditHeight({ target: inlineInputRef.value });
      inlineInputRef.value?.focus();
    });
  } else {
    toast(res?.error || "记录失败", "error");
  }
}

// ===== 完成 / 退回 =====
async function markDone(t) {
  const res = await api(`api/quick-tasks/${t.id}`, { method: "PUT", body: JSON.stringify({ action: "complete" }) });
  if (res?.ok) await load();
  else toast(res?.error || "操作失败", "error");
}
async function reopenTask(t) {
  const res = await api(`api/quick-tasks/${t.id}`, { method: "PUT", body: JSON.stringify({ action: "reopen" }) });
  if (res?.ok) await load();
  else toast(res?.error || "操作失败", "error");
}

// ===== 点击即编辑（光标定位到点击处）与空行即删 =====
function startEdit(t, e) {
  hideInline(); // 编辑态与新增行互斥
  if (editId.value === t.id) return;
  editId.value = t.id;
  editText.value = t.content;
  const clickX = e?.clientX;
  const clickY = e?.clientY;
  nextTick(() => {
    const el = document.querySelector(".qtp-edit-input");
    if (!el) return;
    fitEditHeight({ target: el });
    el.focus();
    // 光标定位：把点击坐标换算为文本偏移（行内容只有一个纯文本节点），失败则落末尾
    let offset = editText.value.length;
    try {
      const range = document.caretRangeFromPoint(clickX, clickY);
      if (range && range.startContainer.nodeType === Node.TEXT_NODE) offset = range.startOffset;
    } catch (_) { /* 降级末尾 */ }
    el.setSelectionRange(offset, offset);
  });
}
// 编辑框随内容自动增高（沿 30px 横格线）
function fitEditHeight(e) {
  const el = e.target;
  el.style.height = "auto";
  el.style.height = Math.max(30, el.scrollHeight) + "px";
}
function cancelEdit() {
  editId.value = null;
  editText.value = "";
}
// 保存（回车或 blur 触发）：内容非空更新；清空 = 直接删除该条（无需确认）
async function saveEdit(id, val) {
  const v = (val ?? editText.value).trim();
  if (!v) { await removeEmpty(id); return; }
  const res = await api(`api/quick-tasks/${id}`, { method: "PUT", body: JSON.stringify({ content: v }) });
  if (res?.ok) await load();
  else toast(res?.error || "保存失败", "error");
  cancelEdit();
}
// 编辑态失焦（点击 outside）：内容变了 = 保存，清空 = 删除，未变 = 静默退出
function onEditBlur(t) {
  if (editId.value !== t.id) return; // 已由其他路径处理（回车保存/Esc 后 DOM 移除触发）
  const v = editText.value.trim();
  if (!v) { removeEmpty(t.id); return; }
  if (v === t.content) { cancelEdit(); return; }
  saveEdit(t.id, v);
}
async function removeEmpty(id) {
  cancelEdit();
  const res = await api(`api/quick-tasks/${id}`, { method: "DELETE" });
  if (res?.ok) await load();
  else toast(res?.error || "删除失败", "error");
}

// ===== 删除二次确认（归档数据破坏性操作用；未完成草稿清空即删无需确认） =====
const delConfirm = reactive({ show: false, message: "", action: null });
function askDelete(message, action) {
  delConfirm.message = message;
  delConfirm.action = action;
  delConfirm.show = true;
}
async function doConfirmDelete() {
  const action = delConfirm.action;
  delConfirm.show = false;
  if (action) await action();
}

// ===== 归档 =====
async function archiveOne(t) {
  const res = await api(`api/quick-tasks/${t.id}/archive`, { method: "POST" });
  if (res?.ok) { await load(); loadArchCount(); }
  else toast(res?.error || "归档失败", "error");
}
async function archiveAll() {
  const n = doneList.value.length;
  if (!n) { toast("没有可归档的数据", "error"); return; }
  const res = await api("api/quick-tasks/archive", { method: "POST", body: JSON.stringify({ all: true }) });
  if (res?.ok) { await load(); loadArchCount(); }
  else toast(res?.error || "归档失败", "error");
}

// ===== 转正式任务 =====
const convShow = ref(false);
const convSaving = ref(false);
const convTarget = ref(null);
const convForm = reactive({ projectId: "", name: "", priority: "P3" });
const convRules = {
  projectId: [{ required: true, message: "请选择目标项目", trigger: "change" }],
  name: [{ required: true, message: "请填写任务名称", trigger: "blur" }],
};
const projectOptions = ref([]);

async function openConvert(t) {
  convTarget.value = t;
  convForm.name = t.content;
  convForm.projectId = "";
  convForm.priority = "P3";
  convShow.value = true;
  // 全量项目，排除已归档
  const res = await api("api/projects");
  if (res?.ok) {
    projectOptions.value = (res.data || []).filter((p) => !p.archived);
  }
}
async function doConvert() {
  convSaving.value = true;
  try {
    const res = await api(`api/quick-tasks/${convTarget.value.id}/convert`, {
      method: "POST",
      body: JSON.stringify({ projectId: convForm.projectId, name: convForm.name, priority: convForm.priority }),
    });
    if (res?.ok) {
      convShow.value = false;
      await load();
      loadArchCount();
      emit("changed");
    } else {
      toast(res?.error || "转化失败", "error");
    }
  } finally {
    convSaving.value = false;
  }
}
function goProject(t) {
  if (t.convertedProjectId) emit("open-project", t.convertedProjectId);
}

// ===== 已归档弹窗 =====
const archShow = ref(false);
const archItems = ref([]);
const archTotal = ref(0);
const archPage = ref(1);
const archPageSize = 5;
const archKeyword = ref("");
let archTimer = null;

const archPages = computed(() => Math.max(1, Math.ceil(archTotal.value / archPageSize)));

function loadArchCount() {
  // 复用归档接口取 total 做角标
  api("api/quick-tasks/archived?page=1&pageSize=1").then((res) => {
    if (res?.ok) archTotal.value = res.data.total || 0;
  });
}
async function loadArchived() {
  const kw = encodeURIComponent(archKeyword.value.trim());
  const res = await api(`api/quick-tasks/archived?page=${archPage.value}&pageSize=${archPageSize}&keyword=${kw}`);
  if (res?.ok) {
    archItems.value = res.data.items || [];
    archTotal.value = res.data.total || 0;
  }
}
function openArchive() {
  archShow.value = true;
  archPage.value = 1;
  archKeyword.value = "";
  loadArchived();
}
function onArchSearch() {
  clearTimeout(archTimer);
  archTimer = setTimeout(() => { archPage.value = 1; loadArchived(); }, 250);
}
function archGo(p) {
  archPage.value = p;
  loadArchived();
}
async function deleteArch(t) {
  askDelete("确认删除该条归档？", async () => {
    const res = await api("api/quick-tasks/archived", { method: "DELETE", body: JSON.stringify({ id: t.id }) });
    if (res?.ok) await loadArchived();
    else toast(res?.error || "删除失败", "error");
  });
}
async function deleteAllArch() {
  if (!archTotal.value) { toast("没有可删除的数据", "error"); return; }
  askDelete(`确认删除全部 ${archTotal.value} 条归档？`, async () => {
    const res = await api("api/quick-tasks/archived?all=1", { method: "DELETE" });
    if (res?.ok) { archPage.value = 1; await loadArchived(); }
    else toast(res?.error || "删除失败", "error");
  });
}

onMounted(() => {
  load();
  loadArchCount();
});

defineExpose({ load });
</script>

<style scoped>
.qtp-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 隐藏滚动条但保留滚动能力 */
  scrollbar-width: none;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
}
.qtp-wrap::-webkit-scrollbar { display: none; }
.qtp-paper {
  flex: 1 0 auto; /* basis 取内容高度：内容多时纸张自然撑长，少时拉伸占满 */
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #e0d7c6;
  border-radius: 6px;
  position: relative;
  box-shadow: 0 3px 14px rgba(95, 87, 77, 0.1);
  padding: 20px 30px 16px 60px;
  font-family: 'Noto Serif SC', var(--font-serif, serif);
  color: #5f574d;
  box-sizing: border-box;
}
/* 装订孔 + 撕口（仅左侧）：样式对齐 ProjectCard */
.qtp-gutter { position: absolute; top: 8px; bottom: 8px; width: 30px; pointer-events: none; }
.qtp-gutter-left { left: 0; }
.qtp-tear {
  position: absolute; top: 0; bottom: 0; width: 1px;
  background-image: linear-gradient(to bottom, #d6ccb8 0, #d6ccb8 4px, transparent 4px, transparent 8px);
  background-size: 1px 8px;
  background-repeat: repeat-y;
}
.qtp-gutter-left .qtp-tear { left: 26px; }
.qtp-holes {
  position: absolute; top: 0; bottom: 0; left: 0; width: 22px;
  display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  padding: 6px 0;
}
.qtp-hole {
  width: 14px; height: 14px; border-radius: 50%;
  background: #ffffff;
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.16),
    inset 0 -1px 2px rgba(255, 255, 255, 0.6),
    inset 0 0 0 1px #d6ccb8;
  flex: none;
}
/* 标题 */
.qtp-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.qtp-title { font-family: 'EB Garamond', 'Noto Serif SC', serif; font-size: 19px; font-weight: 600; letter-spacing: 1px; color: oklch(0.5 0.16 28); }
.qtp-refresh {
  margin-left: auto;
  border: none; background: none; cursor: pointer;
  color: #9a9186; padding: 3px; border-radius: 4px;
  display: inline-flex; align-items: center;
}
.qtp-refresh:hover { color: #537d96; background: rgba(83, 125, 150, 0.08); }
.qtp-refresh .spinning { animation: qtp-spin 0.8s linear infinite; }
@keyframes qtp-spin { to { transform: rotate(360deg); } }
.qtp-sub { font-size: 11.5px; color: #9a9186; margin-bottom: 12px; font-family: var(--el-font-family, sans-serif); }
/* 横格行 */
.qtp-lines {
  flex: 1;
  /* 空白区域延续横格线，保持整张纸连续（30px 网格与行高对齐） */
  background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 29px, #e0d7c6 29px, #e0d7c6 30px);
}
.qtp-line-row {
  display: flex; align-items: flex-start; gap: 8px;
  min-height: 30px;
  position: relative;
}
.qtp-inline-row { background-color: transparent; }
/* 列表末尾固定空行：点击输入 */
.qtp-newline-row { cursor: text; }
/* 新增输入框：多行，浅底提示可输入；宽度对齐编辑框（消除跳字） */
.qtp-new-input {
  background-color: rgba(83, 125, 150, 0.05);
}
.qtp-new-input::placeholder { color: #c9c0b2; }
/* 全文常显：文字沿 30px 横格线多行铺开；padding 与编辑框一致，进入编辑不跳字 */
.qtp-line-content {
  flex: 1; min-width: 0;
  font-size: 13.5px; line-height: 30px; word-break: break-all;
  padding: 0 4px;
}
.qtp-text { white-space: normal; }
.qtp-done-text { white-space: normal; }
/* 操作栏：inline 浮在最后一行右侧，文字自动让位 */
.qtp-ops {
  display: none;
  float: right;
  margin-left: 10px;
  line-height: 30px;
  white-space: nowrap;
}
.qtp-line-row:hover .qtp-ops,
.qtp-done-row:hover .qtp-ops { display: inline; }
/* 条目序号 */
.qtp-idx {
  flex: none; width: 26px;
  font-family: 'EB Garamond', 'Noto Serif SC', serif;
  font-size: 12.5px; color: #b3a996;
  text-align: right; line-height: 30px;
  user-select: none;
}
/* 时间：已完成行不再展示时间 */
.qtp-act {
  font-family: 'Noto Serif SC', var(--font-serif, serif);
  font-size: 12px; color: #537d96; cursor: pointer;
  padding: 1px 3px; letter-spacing: 0.5px;
  border: none; background: none;
  border-bottom: 1px dashed transparent;
}
.qtp-act:hover { border-bottom: 1px dashed #537d96; }
.qtp-act.qtp-green { color: #4a6b4a; }
.qtp-act.qtp-green:hover { border-bottom-color: #4a6b4a; }
.qtp-act.qtp-red { color: #8b2c1f; }
.qtp-act.qtp-red:hover { border-bottom-color: #8b2c1f; }
.qtp-act-lg { font-size: 13px; }
.qtp-edit-input {
  flex: 1; min-width: 0;
  border: none; outline: none; resize: none;
  background: rgba(83, 125, 150, 0.04);
  background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 29px, rgba(83, 125, 150, 0.35) 29px, rgba(83, 125, 150, 0.35) 30px);
  font-family: inherit; font-size: 13.5px; color: #5f574d;
  padding: 0 4px; box-sizing: border-box;
  line-height: 30px; height: 30px;
  display: block; overflow: hidden;
}
/* 已完成折叠区 */
.qtp-fold { margin-top: 16px; flex: none; }
.qtp-fold-head {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  font-size: 12.5px; color: #9a9186; user-select: none; padding-bottom: 6px;
}
.qtp-arrow { transition: transform 0.18s; display: inline-block; font-size: 10px; }
.qtp-fold.open .qtp-arrow { transform: rotate(90deg); }
.qtp-fold-body { display: none; }
.qtp-fold.open .qtp-fold-body { display: block; }
.qtp-fold-head .qtp-btns { margin-left: auto; display: flex; gap: 6px; }
.qtp-count-tag {
  display: inline-block; font-size: 11px; color: #9a9186;
  font-family: 'JetBrains Mono', monospace; margin-left: 4px;
}
.qtp-done-row {
  display: flex; align-items: flex-start; gap: 8px;
  min-height: 30px;
  position: relative;
}
.qtp-done-text {
  font-size: 13px; color: #b3a996;
  text-decoration: line-through; text-decoration-color: rgba(154, 145, 134, 0.55);
  cursor: pointer;
}
.qtp-conv-tag {
  font-size: 11px; color: #4a6b4a; white-space: nowrap;
  font-family: inherit; letter-spacing: 0.5px; cursor: pointer; flex: none;
}
.qtp-empty {
  font-size: 12.5px; color: #c9c0b2; padding: 16px 4px; text-align: center;
  font-family: var(--el-font-family, sans-serif);
}
/* 底部脚注 */
.qtp-foot {
  margin-top: 14px; padding-top: 10px; border-top: 1px solid #e0d7c6;
  font-size: 11px; color: #9a9186; letter-spacing: 0.5px;
  flex: none;
}
/* 归档弹窗内容 */
.qtp-arch-body { padding: 14px 16px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
.qtp-searchrow { display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-end; }
.qtp-searchrow .el-input { flex: 1; }
.qtp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.qtp-table th {
  text-align: left; font-weight: 500; color: #9a9186; font-size: 11px;
  padding: 7px 8px; border-bottom: 1px solid #e0d7c6; background: #faf6ec;
  white-space: nowrap; letter-spacing: 1px;
}
.qtp-table td { padding: 8px; border-bottom: 1px solid #efe8d8; color: #5f574d; vertical-align: middle; }
.qtp-c-main {
  min-width: 160px; white-space: normal; word-break: break-all;
}
.qtp-c-time {
  font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  white-space: nowrap; color: #b3a996;
}
.qtp-link { color: #4a6b4a; cursor: pointer; }
.qtp-pager {
  display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 12px;
  font-size: 12px; color: #9a9186; justify-content: flex-end;
}
.qtp-arch-total { margin-right: auto; font-size: 11.5px; }
.qtp-pager button {
  border: 1px solid #e0d7c6; background: #fff; border-radius: 4px;
  min-width: 26px; height: 24px; cursor: pointer; font-size: 12px; color: #9a9186;
}
.qtp-pager button.cur { background: #537d96; border-color: #537d96; color: #fff; }
.qtp-pager button:disabled { opacity: 0.35; cursor: default; }
</style>
