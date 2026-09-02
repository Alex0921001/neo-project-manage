<template>
  <div class="annot-panel" :class="{ embedded }">
    <div class="annot-head">
      <div class="annot-head-left">
        <span class="annot-title">便利贴</span>
        <span v-if="target" class="annot-target">{{ targetLabel }}</span>
      </div>
      <div v-if="!embedded" class="annot-head-actions">
        <button class="annot-close" title="批注管理（大屏）" @click="manageShow = true">
          <el-icon><FullScreen /></el-icon>
        </button>
        <button class="annot-close" title="关闭便利贴面板" @click="emit('close')">✕</button>
      </div>
    </div>

    <div v-if="!target && !allMode" class="annot-empty">
      <span class="annot-empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </span>
      <p>点击任务或子任务的<br /><b>批注</b>按钮查看备注</p>
    </div>

    <div v-else class="annot-body">
      <!-- 类型筛选 chips：全部/备注/决策/风险/节点 + 关键字搜索（高亮与任务列表一致） -->
      <div class="annot-kind-filter">
        <button
          v-for="k in kindFilterOptions"
          :key="k.value"
          class="kind-chip"
          :class="['kind-chip-' + k.value, { active: kindFilter === k.value }]"
          @click="kindFilter = k.value"
        >{{ k.label }}</button>
        <!-- 关键字搜索（仅大屏弹窗 embedded 显示，小屏侧栏隐藏） -->
        <div v-if="embedded" class="annot-search">
          <svg class="annot-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="keyword" class="annot-search-input" placeholder="搜索批注" @click.stop />
          <button v-if="keyword" class="annot-search-clear" title="清空" @click="keyword = ''">×</button>
        </div>
      </div>

      <!-- 便利贴列表：点击内容即编辑（Windows 便利贴式），删除按钮常驻 -->
      <div class="sticky-board" ref="stickyBoardRef">
        <template v-if="filteredAnnotations.length">
          <div
            v-for="a in filteredAnnotations"
            :key="a.id"
            :data-ann-id="a.id"
            :class="['sticky', 'sticky-kind-' + kindOf(a), { 'sticky-done': effectiveConfirmed(a), 'sticky-editing': editingAnnId === a.id }]"
          >
            <!-- 头：最左=确认/激活按钮，右=删除（常驻） -->
            <div class="sticky-head">
              <div class="sticky-head-left">
                <!-- 全部模式 / 已完成任务：确认按钮隐藏（已完成任务冻结，后端兜底） -->
                <button
                  v-if="!targetDone"
                  class="sticky-icon-btn"
                  :class="{ 'sticky-confirmed': effectiveConfirmed(a) }"
                  :title="effectiveConfirmed(a) ? '取消确认' : '确认这条批注'"
                  @click="toggleConfirm(a)"
                >
                  <el-icon v-if="!effectiveConfirmed(a)"><CircleCheck /></el-icon>
                  <el-icon v-else><RefreshLeft /></el-icon>
                </button>
                <span v-if="allMode" class="sticky-task-name" :title="a.taskName">@{{ a.taskName }}</span>
              </div>
              <div class="sticky-actions">
                <button class="sticky-icon-btn sticky-del" @click="askRemove(a)" title="删除">
                  <el-icon><Close /></el-icon>
                </button>
              </div>
            </div>
            <!-- 内容：点击即编辑（textarea 就地替换，blur 保存） -->
            <textarea
              v-if="editingAnnId === a.id"
              v-model="editingContent"
              rows="3"
              class="sticky-inline-input"
              ref="inlineInputEls"
              :data-ann-id="a.id"
              @focus="$event.target.select()"
              @blur="saveInline(a)"
              @keydown.meta.enter.prevent="saveInline(a)"
              @keydown.ctrl.enter.prevent="saveInline(a)"
              @keydown.escape.prevent="cancelInline()"
            ></textarea>
            <p
              v-else
              class="sticky-content rich-view"
              :class="{ 'sticky-editable': !effectiveConfirmed(a) && !targetDone }"
              v-html="highlightRichText(formatDescription(a.content), keyword)"
              :title="effectiveConfirmed(a) || targetDone ? '' : '点击编辑'"
              @click="!effectiveConfirmed(a) && !targetDone && startInline(a)"
            ></p>
            <!-- 脚：左=类型下拉（点击即改），右=时间 -->
            <div class="sticky-foot">
              <span
                v-if="effectiveConfirmed(a)"
                class="sticky-kind-text"
                :class="'kind-txt-' + kindOf(a)"
                title="已确认，类型锁定"
              >
                {{ kindLabel(kindOf(a)) }}
              </span>
              <el-dropdown v-else trigger="click" popper-class="annot-kind-menu" @command="(v) => changeKind(a, v)">
                <span class="sticky-kind-text" :class="'kind-txt-' + kindOf(a)" title="修改类型">
                  {{ kindLabel(kindOf(a)) }}
                  <svg class="sticky-kind-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="k in KINDS"
                      :key="k.value"
                      :command="k.value"
                      :class="{ 'kind-active': kindOf(a) === k.value }"
                    >
                      <svg v-if="kindOf(a) === k.value" class="kind-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span v-else class="kind-check-space"></span>
                      {{ k.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span class="sticky-date">{{ formatDate(a.createdAt) }}</span>
            </div>
          </div>
        </template>
        <div v-else class="sticky-empty">
          {{ kindFilter === 'all' ? (targetDone ? '该任务没有批注' : '暂无批注，写一条吧') : '该类型暂无批注' }}
        </div>
      </div>

      <!-- 输入区：仅未完成态显示；全部模式隐藏新增入口 -->
      <div v-if="!allMode && !targetDone" class="annot-compose">
        <div class="annot-compose-box">
          <textarea
            ref="inputRef"
            v-model="input"
            rows="4"
            placeholder="贴一贴重要信息"
            class="annot-input"
            @keydown.meta.enter="add"
            @keydown.ctrl.enter="add"
          ></textarea>
          <!-- 左下角类型选择：无边框 dropdown，纯文字标签（当前类型 + 箭头） -->
          <div class="annot-compose-toolbar">
            <el-dropdown trigger="click" popper-class="annot-kind-menu" @command="onKindCommand">
              <span class="annot-kind-trigger" title="选择类型">
                {{ kindLabel(inputKind) }}
                <svg class="annot-kind-arrow" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="k in KINDS"
                    :key="k.value"
                    :command="k.value"
                    :class="{ 'kind-active': inputKind === k.value }"
                  >
                    <svg v-if="inputKind === k.value" class="kind-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span v-else class="kind-check-space"></span>
                    {{ k.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        <div class="annot-actions">
          <span class="annot-hint">⌘/Ctrl + Enter 提交</span>
          <div class="annot-actions-right">
            <button class="btn-primary annot-btn" :disabled="!input.trim() || saving" @click="add">
              {{ saving ? "保存中…" : "贴上" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="confirmDel.show"
      :message="`确定要删除这条批注吗？\n\n“${confirmDel.ann?.content?.slice(0, 60) || ''}${(confirmDel.ann?.content || '').length > 60 ? '…' : ''}”`"
      @close="cancelRemove"
      @confirm="doRemove"
    />

    <!-- 批注管理大弹窗：小窗放不下时点头部按钮打开 -->
    <AnnotationManagerModal
      v-model="manageShow"
      :project-id="projectId"
      :tasks="tasks"
      :initial-task-id="target?.id"
      @changed="emit('changed')"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, defineAsyncComponent } from "vue";
import { CircleCheck, Close, FullScreen, RefreshLeft } from "@element-plus/icons-vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import ConfirmModal from "../../../components/ConfirmModal.vue";
// 打破 AnnotationPanel <-> AnnotationManagerModal 编译期循环依赖（TDZ）
const AnnotationManagerModal = defineAsyncComponent(() => import("./AnnotationManagerModal.vue"));
import { formatDescription } from "../../../utils/text.js";
import { highlightRichText } from "../../../utils/highlight.js";

const props = defineProps({
  projectId: String,
  task: Object,           // 任意层级的任务对象（顶层/子/孙都走这一条）
  tasks: Array,            // 项目下所有任务（用于取最新数据）
  embedded: Boolean,       // 嵌入大弹窗模式：隐藏头部按钮、高度自适应撑满
  highlightAnnId: { type: String, default: "" }, // 定位高亮目标批注（滚动 + 闪烁）
  allMode: { type: Boolean, default: false }, // 全部任务模式：展示项目全部批注（隐藏新增入口）
});
const emit = defineEmits(["changed", "close"]);

const input = ref("");
const saving = ref(false);
// 批注管理大弹窗开关（小窗放不下时切大屏管理）
const manageShow = ref(false);
// S9：输入框引用，预填后自动聚焦方便用户继续打字
const inputRef = ref(null);

// ===== 便利贴类型（V2.0）=====
const KINDS = [
  { value: "note", label: "备注" },
  { value: "decision", label: "决策" },
  { value: "risk", label: "风险" },
  { value: "milestone", label: "节点" },
];
const KIND_VALUES = KINDS.map(k => k.value);

// 新建时选择的类型（切换任务后重置为 note）
const inputKind = ref("note");
// ===== 定位高亮：外部传入 highlightAnnId → 重置筛选 + 滚动到该批注 + 闪烁 =====
const stickyBoardRef = ref(null);
watch(
  () => props.highlightAnnId,
  async (id) => {
    if (!id) return;
    kindFilter.value = "all"; // 确保目标批注不被类型筛选过滤掉
    await nextTick();
    await nextTick(); // 筛选重置后再等一次渲染
    const el = stickyBoardRef.value?.querySelector(`[data-ann-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("sticky-flash");
    setTimeout(() => el.classList.remove("sticky-flash"), 1600);
  }
);

// ===== 类型筛选 chips：全部/备注/决策/风险/节点 =====
const kindFilter = ref("all");
const kindFilterOptions = [{ value: "all", label: "全部" }, ...KINDS];
// 关键字搜索（内容匹配，高亮与任务列表一致）
const keyword = ref("");

// dropdown 命令 → 设置新建类型
function onKindCommand(v) {
  inputKind.value = v;
}

// 类型归一化：老数据/非法值兜底为 note
function kindOf(a) {
  return KIND_VALUES.includes(a?.kind) ? a.kind : "note";
}
function kindLabel(k) {
  return KINDS.find(x => x.value === k)?.label || "备注";
}

// 按类型 + 关键字筛选后的列表
const filteredAnnotations = computed(() => {
  let list = sortedAnnotations.value;
  if (kindFilter.value !== "all") list = list.filter((a) => kindOf(a) === kindFilter.value);
  const kw = keyword.value.trim();
  if (kw) list = list.filter((a) => String(a.content || "").toLowerCase().includes(kw.toLowerCase()));
  return list;
});

// 内联编辑状态（Windows 便利贴式：点击内容就地编辑）
const editingAnnId = ref("");
const editingContent = ref("");
const editingSaving = ref(false);
// textarea 元素引用集合（用于编辑态自动聚焦）
const inlineInputEls = ref([]);

// 本地确认态覆盖：点击确认/取消后立即反映样式，但不触发列表重排（避免确认瞬间跳到末尾）
const localOverride = ref(new Map());
function effectiveConfirmed(a) {
  if (localOverride.value.has(a.id)) return localOverride.value.get(a.id);
  return !!a.confirmed;
}

// 点击内容 → 进入就地编辑（已确认的便利贴锁定，不可编辑）
function startInline(ann) {
  if (effectiveConfirmed(ann) || editingSaving.value) return;
  editingAnnId.value = ann.id;
  editingContent.value = ann.content;
  // 等 DOM 渲染后聚焦
  requestAnimationFrame(() => {
    const el = (inlineInputEls.value || []).find((x) => x?.dataset?.annId === ann.id);
    el?.focus();
  });
}
// 失焦 / Ctrl+Enter → 保存（内容为空则回退显示原文）
async function saveInline(ann) {
  if (editingAnnId.value !== ann.id) return;
  const content = editingContent.value.trim();
  editingAnnId.value = "";
  if (!content) return; // 空内容不保存，回退显示原文
  editingSaving.value = true;
  try {
    const res = await api(buildUrl(ann), {
      method: "PUT",
      body: JSON.stringify({ content, kind: kindOf(ann) }),
      silent: true,
    });
    if (res?.ok) {
      emit("changed");
    } else {
      toast(res.error || "更新失败", "error");
    }
  } finally {
    editingSaving.value = false;
  }
}
// Esc → 取消编辑，不保存
function cancelInline() {
  editingAnnId.value = "";
  editingContent.value = "";
}
// 类型下拉直接改（选择即保存）
async function changeKind(ann, v) {
  if (kindOf(ann) === v) return;
  const res = await api(buildUrl(ann), {
    method: "PUT",
    body: JSON.stringify({ kind: v }),
    silent: true,
  });
  if (res?.ok) emit("changed");
  else toast(res.error || "更新失败", "error");
}

// 删除二次确认
const confirmDel = ref({ show: false, ann: null });

// 层级提示（仅为显示，不影响逻辑）
const targetDepth = computed(() => {
  if (!props.task) return 0;
  return props.task.parent_task_id ? 2 : 1;  // 1=顶层，2=子/孙
});

// 模板 v-if="target" / v-if="!target" 依赖此变量（fe94971 重构时曾误删，导致面板永远显示空状态）
// 全部模式（allMode）下 target 为空：不走空态分支，直接展示全项目批注列表
const target = computed(() => (props.allMode ? null : props.task || null));

const targetLabel = computed(() => (props.allMode ? "全部任务" : props.task?.name || ""));
const targetDone = computed(() => (props.allMode ? false : !!props.task?.done));

// 全部模式：递归收集项目所有任务（任意层级）的批注，带任务名/任务 id
const allAnnotations = computed(() => {
  const out = [];
  const walk = (list) => {
    for (const t of list || []) {
      for (const a of t.annotations || []) out.push({ ...a, taskId: t.id, taskName: t.name });
      walk(t.subtasks);
    }
  };
  walk(props.tasks);
  return out;
});

const annotations = computed(() => {
  if (props.allMode) return allAnnotations.value;
  if (!props.task) return [];
  // 树形结构里：递归找到任意层级的 task（含子孙）拿它的 annotations
  function findAnns(tasks, id) {
    for (const t of tasks) {
      if (t.id === id) return t.annotations || [];
      if (t.subtasks?.length) {
        const sub = findAnns(t.subtasks, id);
        if (sub) return sub;
      }
    }
    return null;
  }
  const live = props.tasks ? findAnns(props.tasks, props.task.id) : null;
  return live || props.task.annotations || [];
});

// 排序：未确认在前（按 createdAt 倒序），已确认在后（按 createdAt 倒序）
// 本次会话内被本地确认/取消过的批注：保持原始顺序位置，不参与分组移动（点击确认不跳位）
const sortedAnnotations = computed(() => {
  const list = annotations.value.map((a, idx) => ({ ...a, _srcIdx: idx, confirmed: !!a.confirmed }));
  const byTimeDesc = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const overridden = list
    .filter((a) => localOverride.value.has(a.id))
    .sort((a, b) => a._srcIdx - b._srcIdx);
  const rest = list.filter((a) => !localOverride.value.has(a.id));
  const pending = rest.filter((a) => !a.confirmed).sort(byTimeDesc);
  const done = rest.filter((a) => a.confirmed).sort(byTimeDesc);
  const out = [];
  let oi = 0, pi = 0, di = 0;
  for (const a of list) {
    if (localOverride.value.has(a.id)) out.push(overridden[oi++]);
    else if (a.confirmed) out.push(done[di++]);
    else out.push(pending[pi++]);
  }
  return out;
});

watch(() => props.task?.id, () => { input.value = ""; inputKind.value = "note"; });

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, "0");
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 操作 URL：全部模式用批注自带 taskId（跨任务），单任务模式用当前任务
function buildUrl(ann) {
  const taskId = props.allMode ? ann.taskId : props.task.id;
  return `api/projects/${props.projectId}/tasks/${taskId}/annotations/${ann.id}`;
}

// ===== S9：里程碑快捷按钮 =====
// 本地时间 YYYY-MM-DD（不用 toISOString，避免时区偏移）
async function add() {
  const content = input.value.trim();
  if (!content || !props.task) return;
  saving.value = true;
  try {
    const url = `api/projects/${props.projectId}/tasks/${props.task.id}/annotations`;
    const res = await api(url, { method: "POST", body: JSON.stringify({ content, kind: inputKind.value }) });
    if (res?.ok) {
      input.value = "";
      emit("changed");
    } else {
      toast(res.error || "保存失败", "error");
    }
  } finally {
    saving.value = false;
  }
}

async function remove(ann) {
  const res = await api(buildUrl(ann), { method: "DELETE", silent: true });
  if (res?.ok) emit("changed");
  else toast(res.error || "删除失败", "error");
}

function askRemove(ann) {
  confirmDel.value = { show: true, ann };
}
function cancelRemove() {
  confirmDel.value = { show: false, ann: null };
}
async function doRemove() {
  const ann = confirmDel.value.ann;
  confirmDel.value = { show: false, ann: null };
  if (!ann) return;
  await remove(ann);
}

async function toggleConfirm(ann) {
  if (targetDone.value) return; // V2.1 规则：任务已完成便利贴冻结，不可切换确认状态
  const target = !effectiveConfirmed(ann);
  const res = await api(buildUrl(ann), {
    method: "PUT",
    body: JSON.stringify({ confirmed: target }),
    silent: true,
  });
  if (res?.ok) {
    // 本地乐观更新：立即划线/变绿且保持原位；同时同步全局数据（大屏/小屏/角标一致）
    localOverride.value.set(ann.id, target);
    emit("changed");
  } else {
    toast(res.error || "操作失败", "error");
  }
}
</script>

<style scoped>
.annot-panel {
  display: flex; flex-direction: column;
  flex-shrink: 0;
  min-height: 200px;
  max-height: 560px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 14px;
  overflow: hidden;
  box-sizing: border-box;
}
/* 嵌入大弹窗：解除高度限制，撑满容器 */
.annot-panel.embedded {
  max-height: none;
  min-height: 0;
  height: 100%;
}

.annot-head {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 8px;
}
.annot-head-left {
  display: flex; align-items: baseline; gap: 8px;
  min-width: 0; flex: 1;
}
.annot-title {
  font-size: 13px; font-weight: 700; color: var(--text-secondary);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.annot-target {
  font-size: 11px; color: var(--text-tertiary);
  background: var(--bg-hover);
  padding: 2px 8px; border-radius: 10px;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.annot-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.annot-close {
  width: 24px; height: 24px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.annot-close:hover {
  background: var(--bg-hover);
  color: var(--danger);
  border-color: var(--danger);
}

.annot-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--text-tertiary); font-size: 12px; text-align: center;
  gap: 6px;
}
.annot-empty-icon { width: 44px; height: 44px; border-radius: 50%; background: var(--bg-hover); display: inline-flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.annot-empty b { color: var(--text-secondary); }

.annot-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }

/* 便利贴列表：完成态只展示便利贴，未完成态便利贴在 sticky-board 上半部分 */
.sticky-board {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding-right: 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sticky-board::-webkit-scrollbar { display: none; }
.sticky-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--text-tertiary); padding: 24px 0;
}

/* 便利贴：黄底（待确认）/ 绿底（已确认），带轻阴影；三段式：头/内容/脚 */
.sticky {
  padding: 8px 12px 10px;
  background: var(--sticky-bg);
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm);
  word-break: break-word;
  transition: background var(--duration-fast) var(--ease-out);
}
/* 全部模式：批注所属任务名标签（头部左侧，确认按钮旁边） */
.sticky-task-name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
  flex-shrink: 1;
  min-width: 0;
}
/* 类型着色（V2.0）：色相对齐全局 status 变量，浅底保证深/浅主题均可见 */
.sticky-kind-decision { background: oklch(0.95 0.09 255); }
.sticky-kind-risk { background: oklch(0.95 0.09 25); }
.sticky-kind-milestone { background: oklch(0.95 0.09 75); }
.sticky-done {
  background: var(--sticky-bg-confirmed);
}
/* 定位高亮：外部跳转（概览/里程碑）定位批注时闪烁（琥珀脉冲 3 次） */
.sticky-flash {
  animation: sticky-flash-pulse 0.5s ease-in-out 3;
  box-shadow: 0 0 0 3px var(--accent-warm-hover);
}
@keyframes sticky-flash-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.22); }
}
/* 头：左=确认/激活按钮，右=编辑/删除工具栏 */
.sticky-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.sticky-head-left {
  display: flex;
  align-items: center;
}
.sticky-content {
  margin: 0 0 8px; font-size: 13px; line-height: 1.55;
  color: var(--text);
}
.sticky-done .sticky-content {
  color: var(--text);
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}
.sticky-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}
/* 脚部类型：纯文字 + 下拉箭头（点击修改类型） */
.sticky-kind-text {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
}
.sticky-kind-arrow {
  opacity: 0.6;
}
.kind-txt-note { color: oklch(0.55 0.12 90); }
.kind-txt-decision { color: oklch(0.55 0.21 255); }
.kind-txt-risk { color: oklch(0.58 0.24 25); }
.kind-txt-milestone { color: oklch(0.62 0.15 75); }
.sticky-done .sticky-foot { color: var(--text-secondary); }
.sticky-actions { display: flex; gap: 4px; align-items: center; }

/* 统一图标按钮：无边框；常态不降透明度，hover 加深颜色保证可读 */
.sticky-icon-btn {
  width: 26px; height: 26px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color var(--duration-fast) var(--ease-out);
}
/* 图标描边加粗，小尺寸下更清晰 */
.sticky-icon-btn svg,
.sticky-icon-btn svg path {
  stroke-width: 2.4;
}
.sticky-icon-btn:hover {
  color: var(--text);
}
/* 确认态：类型仅查看（光标默认，无下拉交互） */
.sticky-done .sticky-kind-text {
  cursor: default;
}
/* 确认按钮：已确认绿色（状态语义），hover 同色加深 */
.sticky-icon-btn.sticky-confirmed {
  color: oklch(0.5 0.15 150);
}
.sticky-icon-btn.sticky-confirmed:hover {
  color: oklch(0.42 0.15 150);
}

/* 内联编辑态：保留类型底色，仅叠加浮起阴影（去琥珀边框，编辑中便利贴呈“被拿起”层级） */
.sticky.sticky-editing {
  box-shadow: var(--shadow-raised);
}
/* 内联编辑 textarea：与便利贴同底色、无边框、贴合内容（Windows 便利贴式） */
.sticky-inline-input {
  width: 100%;
  padding: 0;
  margin-bottom: 8px;
  border: none;
  border-radius: 0;
  font-size: 13px; line-height: 1.55;
  background: transparent;
  color: var(--text);
  outline: none;
  resize: none;
  font-family: inherit;
  min-height: 60px;
}
/* 内容可点击编辑：hover 轻微提示（光标变化 + 半透明） */
.sticky-editable {
  cursor: text;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.sticky-editable:hover {
  opacity: 0.85;
}

/* 类型筛选 chips（V2.0） */
.annot-kind-filter {
  display: flex; gap: 6px; flex-wrap: wrap;
  flex-shrink: 0;
}
/* 关键字搜索框（chips 右侧，风格对齐任务列表搜索） */
.annot-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: auto;
  min-width: 0;
}
.annot-search-icon {
  position: absolute;
  left: 8px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.annot-search-input {
  width: 170px;
  padding: 5px 24px 5px 26px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.annot-search-input:focus {
  border-color: var(--border);
}
.annot-search-clear {
  position: absolute;
  right: 4px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
}
.annot-search-clear:hover {
  color: var(--text);
  background: var(--bg-hover);
}
/* 关键字高亮：与任务列表 TaskCard 一致（浅琥珀底 + 深琥珀字） */
.sticky-content :deep(.hl) {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  font-weight: 700;
  padding: 0 2px;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.kind-chip {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.kind-chip:hover {
  color: var(--text);
  background: var(--border-light);
}
.kind-chip.active { color: #1a1a1a; }
.kind-chip-all.active { background: oklch(0.9 0 0); }
.kind-chip-note.active { background: oklch(0.87 0.10 90); }
.kind-chip-decision.active { background: oklch(0.85 0.10 255); }
.kind-chip-risk.active { background: oklch(0.85 0.10 25); }
.kind-chip-milestone.active { background: oklch(0.87 0.10 75); }

/* 类型小标签（V2.0）：半透明底 + 类型色圆点，在时间右侧 */
.sticky-kind-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 7px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-secondary);
}
.kind-tag-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.kind-tag-note .kind-tag-dot { color: oklch(0.62 0.12 90); }
.kind-tag-decision .kind-tag-dot { color: oklch(0.62 0.21 255); }
.kind-tag-risk .kind-tag-dot { color: oklch(0.64 0.24 25); }
.kind-tag-milestone .kind-tag-dot { color: oklch(0.7 0.15 75); }

/* 类型下拉（V2.0）：无边框 dropdown（左下角纯文字标签） */
/* 输入框容器：边框/圆角/背景都在这层，textarea 无边框；toolbar 是底部正常流行，不与文字重叠 */
.annot-compose-box {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  transition: border-color var(--duration-fast) var(--ease-out);
}
.annot-compose-box:focus-within {
  border-color: var(--accent-warm);
}
.annot-compose-toolbar {
  display: flex;
  align-items: center;
  padding: 2px 8px 6px;
}
.annot-kind-trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  user-select: none;
  transition: color var(--duration-fast) var(--ease-out);
}
.annot-kind-trigger:hover {
  color: var(--text);
}
.annot-kind-arrow {
  color: currentColor;
  opacity: 0.75;
}

/* 输入区：仅未完成态显示 */
.annot-compose {
  border-top: 1px solid var(--border-light);
  padding-top: 10px;
  display: flex; flex-direction: column; gap: 6px;
  flex-shrink: 0;
}
.annot-input {
  width: 100%;
  padding: 10px 12px 2px;
  border: none;
  border-radius: 0;
  font-size: 13px; line-height: 1.55;
  background: transparent;
  color: var(--text);
  outline: none; resize: none;
  font-family: inherit;
  min-height: 90px;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.annot-input:focus { border-color: transparent; }
.annot-actions {
  display: flex; justify-content: space-between; align-items: center;
}
.annot-actions-right {
  display: flex; align-items: center;
  gap: 8px;
}
.annot-hint { font-size: 11px; color: var(--text-tertiary); }
.annot-btn {
  padding: 5px 16px; border-radius: var(--radius-sm);
  background: var(--accent-warm); color: var(--bg-card);
  border: 1px solid var(--accent-warm);
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.annot-btn:hover:not(:disabled) {
  background: var(--accent-warm-hover); border-color: var(--accent-warm-hover);
}
.annot-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

<style>
/* ===== 类型 dropdown 菜单（teleport 到 body，必须全局） =====
 * 无圆角无阴影；hover 项才有阴影；纯文字 + 对勾指示当前项 */
.annot-kind-menu.el-dropdown__popper {
  box-shadow: none;
  border-radius: 0;
  border: 1px solid var(--border);
  background: var(--bg-card);
}
.annot-kind-menu.el-dropdown__popper .el-dropdown-menu {
  padding: 4px;
  border-radius: 0;
  box-shadow: none;
  background: var(--bg-card);
}
.annot-kind-menu .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  padding: 6px 12px;
  border-radius: 0;
  line-height: 1.6;
  color: var(--text);
  box-shadow: none;
}
.annot-kind-menu .el-dropdown-menu__item:hover {
  background: var(--bg-hover);
}
.annot-kind-menu .el-dropdown-menu__item.kind-active {
  font-weight: 700;
  color: var(--text);
  background: var(--bg-card);
}
.kind-check {
  flex-shrink: 0;
  color: var(--text);
}
.kind-check-space {
  width: 12px;
  flex-shrink: 0;
}
</style>