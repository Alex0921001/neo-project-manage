<template>
  <div class="set-tabs">
    <!-- V2.3 精修：项目集横条溢出用左右箭头平移（不无限延长滚动条） -->
    <button
      v-if="canScrollLeft"
      class="tab-arrow"
      title="向左滚动"
      @click="scrollTabs(-1)"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <!-- tabs：全部项目 + 各项目集（可拖拽排序） -->
    <draggable
      ref="tabsInnerRef"
      :list="tabItems"
      item-key="key"
      ghost-class="tab-ghost"
      :animation="150"
      :force-fallback="true"
      fallback-on-body
      fallback-tolerance="8"
      @end="onDragEnd"
      class="tabs-inner"
    >
      <template #item="{ element }">
        <div
          :class="['set-tab', { active: isActive(element) }]"
          :title="element.isSet ? `${element.label}（右键管理）` : element.label"
          @click="select(element)"
          @contextmenu.prevent="openCtx($event, element)"
        >
          <span class="tab-label">{{ element.label }}</span>
          <span class="tab-count">{{ element.count }}</span>
        </div>
      </template>
    </draggable>
    <button
      v-if="canScrollRight"
      class="tab-arrow"
      title="向右滚动"
      @click="scrollTabs(1)"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

    <div class="tabs-actions">
      <button class="tab-manage" title="管理项目集" @click="openManager">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <!-- V2.3 R2：全局搜索入口（齿轮右侧，铃铛左侧） -->
      <button class="tab-manage" title="全局搜索（Ctrl+F）" @click="searchShow = true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <!-- V2.3 精修：提醒/消息中心入口移到工具栏最右端 -->
      <button class="tab-manage" title="消息中心" @click="msgShow = true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span v-if="unread > 0" class="unread-badge" :title="`${unread} 条未读消息`">{{ unread > 99 ? '99+' : unread }}</span>
      </button>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="ctx.show"
      class="ctx-menu"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
    >
      <button @click="ctxEdit">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        编辑
      </button>
      <button class="ctx-danger" @click="ctxDelete">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        删除
      </button>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="editShow"
      :title="editMode === 'add' ? '新建项目集' : '编辑项目集'"
      width="400px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form ref="formRef" :model="editForm" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" maxlength="10" show-word-limit placeholder="最多10字" @keyup.enter="doSave" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editShow = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">{{ editMode === 'add' ? '创建' : '保存' }}</el-button>
      </template>
    </el-dialog>

    <!-- 管理弹窗（列表 + 排序 + 快捷增删） -->
    <el-dialog
      v-model="mgrShow"
      title="管理项目集"
      width="440px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="mgr-list">
        <draggable
          :list="mgrSets"
          item-key="id"
          ghost-class="mgr-ghost"
          :animation="150"
          :force-fallback="true"
          fallback-on-body
          fallback-tolerance="8"
          @end="onMgrDragEnd"
          class="mgr-drag"
        >
          <template #item="{ element }">
            <div class="mgr-row">
              <el-input
                v-if="mgrEditId === element.id"
                v-model="mgrEditName"
                size="small"
                maxlength="10"
                class="mgr-edit"
                @keyup.enter="mgrSaveEdit(element)"
                @keyup.esc="mgrCancelEdit"
                @blur="mgrSaveEdit(element)"
              />
              <span v-else class="mgr-name">{{ element.name }}</span>
              <span class="mgr-count">{{ element.projectCount }} 项目</span>
              <div class="mgr-ops">
                <button class="mgr-op" title="编辑" @click="mgrEdit(element)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="mgr-op mgr-danger" title="删除" @click="mgrDelete(element)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          </template>
        </draggable>
        <div v-if="!mgrSets.length" class="mgr-empty">还没有项目集，在下方输入名称回车新增</div>
      </div>
      <div class="mgr-add">
        <el-input
          v-model="mgrName"
          placeholder="输入项目集名称，回车立即新增"
          maxlength="10"
          clearable
          @keyup.enter="mgrAdd"
        />
      </div>
    </el-dialog>

    <!-- V2.3 R1：消息中心弹窗（读/删后刷新铃铛角标） -->
    <MessageCenterPanel v-model="msgShow" @changed="loadUnread" />
    <!-- V2.3 R2：全局搜索弹窗 -->
    <SearchPanel v-model="searchShow" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import draggable from "vuedraggable";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import MessageCenterPanel from "../MessageCenterPanel.vue";
import SearchPanel from "../../../components/SearchPanel.vue";

const props = defineProps({
  sets: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
});
const emit = defineEmits(["select-set", "changed", "confirm-ask", "reorder"]);

// ===== V2.3 精修：项目集横条溢出左右箭头（不无限延长滚动条） =====
const tabsInnerRef = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let tabsObs = null;

function tabsEl() {
  // vuedraggable 的 ref 是组件实例，根元素即 .tabs-inner
  return tabsInnerRef.value?.$el || tabsInnerRef.value || null;
}

function updateArrowState() {
  const el = tabsEl();
  if (!el) return;
  canScrollLeft.value = el.scrollLeft > 0;
  canScrollRight.value = el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
}

/** 点击箭头平移（每击约 1/3 容器宽，平滑滚动） */
function scrollTabs(dir) {
  const el = tabsEl();
  if (!el) return;
  el.scrollBy({ left: dir * Math.max(80, Math.round(el.clientWidth / 3)), behavior: "smooth" });
  // 动画结束后的边界状态：延迟再收敛一次（smooth 滚动期间 scrollLeft 持续变化）
  setTimeout(updateArrowState, 350);
}

// 项目集增删/窗口缩放 → 重算箭头显隐
watch(() => props.sets, () => nextTick(updateArrowState), { deep: true });
onMounted(() => {
  nextTick(updateArrowState);
  tabsObs = new ResizeObserver(updateArrowState);
  const el = tabsEl();
  if (el) tabsObs.observe(el);
});
onUnmounted(() => { tabsObs?.disconnect(); });

// ===== V2.3 R1：消息中心 + 全局搜索 =====
const msgShow = ref(false);
const searchShow = ref(false);
const unread = ref(0);

/** 拉取未读数（挂载 / 面板打开 / 读删后刷新；静默失败不影响 UI） */
async function loadUnread() {
  try {
    const res = await api("api/messages/unread-count", { silent: true });
    if (res?.ok) unread.value = res.data.unread || 0;
  } catch { /* ignore */ }
}
// 面板打开时先刷新一次角标（读/删后的 @changed 已覆盖，此处兜底面板外变化）
watch(msgShow, (v) => { if (v) loadUnread(); });

// ===== tabs 数据 =====
const tabItems = computed(() => {
  const total = props.sets.reduce((sum, s) => sum + (s.projectCount || 0), 0);
  return [
    { key: null, label: "全部项目", count: total, isSet: false },
    ...props.sets.map((s) => ({ key: s.id, label: s.name, count: s.projectCount || 0, isSet: true })),
  ];
});

function isActive(el) {
  return el.key === props.selectedId;
}
function select(el) {
  emit("select-set", el.key);
}

function onDragEnd() {
  const ids = tabItems.value.filter((t) => t.isSet).map((t) => t.key);
  emit("reorder", ids);
}

// ===== 右键菜单 =====
const ctx = reactive({ show: false, x: 0, y: 0, set: null });
function openCtx(e, el) {
  if (!el.isSet) return;
  ctx.show = true;
  ctx.x = e.clientX;
  ctx.y = e.clientY;
  ctx.set = props.sets.find((s) => s.id === el.key) || null;
}
function closeCtx() {
  ctx.show = false;
  ctx.set = null;
}
function onDocClick() {
  if (ctx.show) closeCtx();
}
onMounted(() => {
  document.addEventListener("click", onDocClick);
  loadUnread();
});
onUnmounted(() => document.removeEventListener("click", onDocClick));

function ctxEdit() {
  const s = ctx.set;
  closeCtx();
  if (s) startEdit(s);
}
function ctxDelete() {
  const s = ctx.set;
  closeCtx();
  if (s) startDelete(s);
}

// ===== 新增/编辑 =====
const editShow = ref(false);
const editMode = ref("add");
const editTargetId = ref(null);
const saving = ref(false);
const formRef = ref(null);
const editForm = reactive({ name: "" });
const rules = {
  name: [
    { required: true, message: "请填写项目集名称", trigger: "blur" },
    { min: 1, max: 10, message: "名称限 1-10 个字符", trigger: "blur" },
  ],
};

function openAdd() {
  editMode.value = "add";
  editTargetId.value = null;
  editForm.name = "";
  editShow.value = true;
  formRef.value?.clearValidate();
}
function startEdit(s) {
  editMode.value = "edit";
  editTargetId.value = s.id;
  editForm.name = s.name;
  editShow.value = true;
  formRef.value?.clearValidate();
}
async function doSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const name = editForm.name.trim();
  if (editMode.value === "add") {
    if (props.sets.some((s) => s.name.trim() === name)) return toast(`项目集名称「${name}」已存在`, "error");
  } else {
    if (props.sets.some((s) => s.id !== editTargetId.value && s.name.trim() === name)) {
      return toast(`项目集名称「${name}」已被其他项目集使用`, "error");
    }
  }
  saving.value = true;
  try {
    if (editMode.value === "add") {
      const res = await api("api/project-sets", { method: "POST", body: JSON.stringify({ name }), silent: true });
      if (res.ok) { toast("已创建"); editShow.value = false; emit("changed"); }
      else toast(res.error || "创建失败", "error");
    } else {
      const res = await api(`api/project-sets/${editTargetId.value}`, { method: "PUT", body: JSON.stringify({ name }), silent: true });
      if (res.ok) { toast("已更新"); editShow.value = false; emit("changed"); }
      else toast(res.error || "更新失败", "error");
    }
  } finally {
    saving.value = false;
  }
}

// ===== 删除 =====
function startDelete(s) {
  if (s.projectCount > 0) {
    toast(`"${s.name}"下还有 ${s.projectCount} 个项目，无法删除`, "error");
    return;
  }
  emit("confirm-ask", { message: `确认删除项目集「${s.name}」？`, action: "delete-set", payload: s.id });
}

// ===== 管理弹窗 =====
const mgrShow = ref(false);
const mgrSets = ref([]);
const mgrName = ref("");
const mgrEditId = ref(null);
const mgrEditName = ref("");

// 弹窗打开时，父级 sets 变化（编辑/删除/新增成功后 emit changed → Home load）自动同步列表，不关弹窗
watch(
  () => props.sets,
  (list) => {
    if (!mgrShow.value) return;
    const keepEdit = mgrEditId.value;
    mgrSets.value = list.map((s) => ({ ...s }));
    if (keepEdit && !list.some((s) => s.id === keepEdit)) mgrEditId.value = null;
  },
  { deep: true }
);

function openManager() {
  mgrSets.value = props.sets.map((s) => ({ ...s }));
  mgrName.value = "";
  mgrEditId.value = null;
  mgrShow.value = true;
}
function onMgrDragEnd() {
  emit("reorder", mgrSets.value.map((s) => s.id));
}
function mgrEdit(s) {
  mgrEditId.value = s.id;
  mgrEditName.value = s.name;
}
function mgrCancelEdit() {
  mgrEditId.value = null;
}
async function mgrSaveEdit(s) {
  if (mgrEditId.value !== s.id) return;
  const name = mgrEditName.value.trim();
  mgrEditId.value = null;
  if (!name || name === s.name) return;
  if (props.sets.some((x) => x.id !== s.id && x.name.trim() === name)) {
    return toast(`项目集名称「${name}」已被其他项目集使用`, "error");
  }
  saving.value = true;
  try {
    const res = await api(`api/project-sets/${s.id}`, { method: "PUT", body: JSON.stringify({ name }), silent: true });
    if (res.ok) toast("已更新");
    else toast(res.error || "更新失败", "error");
    emit("changed");
  } finally {
    saving.value = false;
  }
}
function mgrDelete(s) {
  // 与右键删除同一链路：走全局 ConfirmModal（位置一致）
  startDelete(s);
}
async function mgrAdd() {
  const name = mgrName.value.trim();
  if (!name) return toast("请填写名称", "error");
  if (name.length > 10) return toast("名称最多10字", "error");
  if (props.sets.some((s) => s.name.trim() === name)) return toast(`项目集名称「${name}」已存在`, "error");
  saving.value = true;
  try {
    const res = await api("api/project-sets", { method: "POST", body: JSON.stringify({ name }), silent: true });
    if (res.ok) { toast("已创建"); mgrName.value = ""; emit("changed"); }
    else toast(res.error || "创建失败", "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.set-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 28px;
  height: 44px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  overflow-x: auto;
}
.tabs-inner {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  /* V2.3 精修：占剩余空间 + 溢出隐藏（左右箭头平移，不用无限延长滚动条） */
  flex: 1 1 auto;
  overflow: hidden;
}
/* 溢出平移箭头 */
.tab-arrow {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.tab-arrow:hover { background: var(--bg-hover); color: var(--text); }
.set-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  cursor: grab;
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  user-select: none;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.set-tab:hover { background: var(--bg-hover); color: var(--text); }
.set-tab.active {
  background: var(--bg-hover);
  color: var(--text);
  font-weight: 700;
}
.tab-count {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 0 5px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.set-tab.active .tab-count { background: var(--bg-hover); color: var(--text); }
.tab-ghost { opacity: 0.4; background: var(--bg-hover); }

.tabs-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}
.tab-manage {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.tab-manage:hover { background: var(--bg-hover); color: var(--text); }

/* V2.3 R1：未读角标（铃铛右上角，琥珀强调） */
.tab-manage { position: relative; }
.unread-badge {
  position: absolute;
  top: -4px;
  right: -5px;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent-warm);
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  box-shadow: 0 0 0 2px var(--bg-card);
}

/* 右键菜单 */
.ctx-menu {
  position: fixed;
  z-index: 2000;
  min-width: 110px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.ctx-menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background var(--duration-fast) var(--ease-out);
}
.ctx-menu button:hover { background: var(--bg-hover); }
.ctx-menu .ctx-danger { color: var(--danger); }
.ctx-menu .ctx-danger:hover { background: #fdecec; }

/* 管理弹窗 */
.mgr-list {
  height: 260px;
  overflow-y: auto;
  margin-bottom: 12px;
}
.mgr-drag { cursor: grab; }
.mgr-drag:active { cursor: grabbing; }
.mgr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--radius-md);
}
.mgr-row:hover { background: var(--bg-hover); }
.mgr-ghost { opacity: 0.4; background: var(--bg-hover); }
.mgr-edit { flex: 1; min-width: 0; }
.mgr-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mgr-count { font-size: 11px; color: var(--text-tertiary); flex-shrink: 0; }
.mgr-ops { display: flex; gap: 2px; flex-shrink: 0; }
.mgr-op {
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
  transition: all var(--duration-fast) var(--ease-out);
}
.mgr-op:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
.mgr-op:disabled { opacity: 0.3; cursor: not-allowed; }
.mgr-danger:hover:not(:disabled) { background: #fdecec; color: var(--danger); }
.mgr-empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-tertiary); }
.mgr-add { display: flex; gap: 8px; }
</style>
