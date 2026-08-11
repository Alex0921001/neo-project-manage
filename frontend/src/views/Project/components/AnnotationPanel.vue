<template>
  <div class="annot-panel">
    <div class="annot-head">
      <div class="annot-head-left">
        <span class="annot-title">便利贴</span>
        <span v-if="target" class="annot-target">{{ targetLabel }}</span>
      </div>
      <button class="annot-close" title="关闭便利贴面板" @click="emit('close')">✕</button>
    </div>

    <div v-if="!target" class="annot-empty">
      <span class="annot-empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </span>
      <p>点击任务或子任务的<br /><b>批注</b>按钮查看备注</p>
    </div>

    <div v-else class="annot-body">
      <!-- 类型筛选 chips：全部/备注/决策/风险/节点 -->
      <div class="annot-kind-filter">
        <button
          v-for="k in kindFilterOptions"
          :key="k.value"
          class="kind-chip"
          :class="['kind-chip-' + k.value, { active: kindFilter === k.value }]"
          @click="kindFilter = k.value"
        >{{ k.label }}</button>
      </div>

      <!-- 便利贴列表：仅展示每一条便利贴，完成态不再有确认按钮 -->
      <div class="sticky-board">
        <template v-if="filteredAnnotations.length">
          <div
            v-for="a in filteredAnnotations"
            :key="a.id"
            :class="['sticky', 'sticky-kind-' + kindOf(a), { 'sticky-done': a.confirmed, 'sticky-editing': editingAnnId === a.id }]"
          >
            <template v-if="editingAnnId === a.id">
              <el-select v-model="editingKind" size="small" class="kind-select">
                <el-option v-for="k in KINDS" :key="k.value" :label="k.label" :value="k.value" />
              </el-select>
              <textarea
                v-model="editingContent"
                rows="4"
                class="sticky-edit-input"
                @keydown.meta.enter="saveEdit"
                @keydown.ctrl.enter="saveEdit"
                @keydown.escape="cancelEdit"
              ></textarea>
            </template>
            <template v-else>
              <p class="sticky-content rich-view" v-html="formatDescription(a.content)"></p>
            </template>
            <div class="sticky-foot">
              <span class="sticky-foot-left">
                <template v-if="editingAnnId !== a.id">
                  <span class="sticky-kind-tag" :class="'kind-tag-' + kindOf(a)">
                    <span class="kind-tag-dot"></span>{{ kindLabel(kindOf(a)) }}
                  </span>
                </template>
                <span class="sticky-date">{{ formatDate(a.createdAt) }}</span>
              </span>
              <div class="sticky-actions">
                <template v-if="editingAnnId === a.id">
                  <button class="sticky-cancel" title="取消" @click="cancelEdit">取消</button>
                  <button class="sticky-save" :disabled="!editingContent.trim() || editingSaving" @click="saveEdit">
                    {{ editingSaving ? "保存中…" : "保存" }}
                  </button>
                </template>
                <template v-else>
                  <button v-if="!a.confirmed" class="sticky-icon-btn" title="编辑" @click="startEdit(a)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    v-if="!targetDone"
                    class="sticky-icon-btn"
                    :title="a.confirmed ? '取消确认' : '确认这条批注'"
                    @click="toggleConfirm(a)"
                  >
                    <svg v-if="!a.confirmed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                  </button>
                  <button v-if="!a.confirmed" class="sticky-icon-btn sticky-del" @click="askRemove(a)" title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </template>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="sticky-empty">
          {{ kindFilter === 'all' ? (targetDone ? '该任务没有批注' : '暂无批注，写一条吧') : '该类型暂无批注' }}
        </div>
      </div>

      <!-- 输入区：仅未完成态显示 -->
      <div v-if="!targetDone" class="annot-compose">
        <div class="annot-compose-kind">
          <el-select v-model="inputKind" size="small" class="kind-select">
            <el-option v-for="k in KINDS" :key="k.value" :label="k.label" :value="k.value" />
          </el-select>
        </div>
        <textarea
          ref="inputRef"
          v-model="input"
          rows="4"
          placeholder="贴一贴重要信息"
          class="annot-input"
          @keydown.meta.enter="add"
          @keydown.ctrl.enter="add"
        ></textarea>
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
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import ConfirmModal from "../../../components/ConfirmModal.vue";
import { formatDescription } from "../../../utils/text.js";

const props = defineProps({
  projectId: String,
  task: Object,           // 任意层级的任务对象（顶层/子/孙都走这一条）
  tasks: Array,            // 项目下所有任务（用于取最新数据）
});
const emit = defineEmits(["changed", "close"]);

const input = ref("");
const saving = ref(false);
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
// 编辑时选择的类型
const editingKind = ref("note");
// 面板筛选：all=全部
const kindFilter = ref("all");
const kindFilterOptions = [{ value: "all", label: "全部" }, ...KINDS];

// 类型归一化：老数据/非法值兜底为 note
function kindOf(a) {
  return KIND_VALUES.includes(a?.kind) ? a.kind : "note";
}
function kindLabel(k) {
  return KINDS.find(x => x.value === k)?.label || "备注";
}

// 按类型筛选后的列表
const filteredAnnotations = computed(() => {
  if (kindFilter.value === "all") return sortedAnnotations.value;
  return sortedAnnotations.value.filter(a => kindOf(a) === kindFilter.value);
});

// 编辑状态
const editingAnnId = ref("");
const editingContent = ref("");
const editingSaving = ref(false);

// 删除二次确认
const confirmDel = ref({ show: false, ann: null });

// 层级提示（仅为显示，不影响逻辑）
const targetDepth = computed(() => {
  if (!props.task) return 0;
  return props.task.parent_task_id ? 2 : 1;  // 1=顶层，2=子/孙
});

// 模板 v-if="target" / v-if="!target" 依赖此变量（fe94971 重构时曾误删，导致面板永远显示空状态）
const target = computed(() => props.task || null);

const targetLabel = computed(() => props.task?.name || "");
const targetDone = computed(() => !!props.task?.done);

const annotations = computed(() => {
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
const sortedAnnotations = computed(() => {
  const list = annotations.value.map(a => ({ ...a, confirmed: !!a.confirmed }));
  const pending = list.filter(a => !a.confirmed);
  const done = list.filter(a => a.confirmed);
  const byTimeDesc = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  pending.sort(byTimeDesc);
  done.sort(byTimeDesc);
  return [...pending, ...done];
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

function buildUrl(annId) {
  return `api/projects/${props.projectId}/tasks/${props.task.id}/annotations/${annId}`;
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
  const res = await api(buildUrl(ann.id), { method: "DELETE", silent: true });
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
  const res = await api(buildUrl(ann.id), {
    method: "PUT",
    body: JSON.stringify({ confirmed: !ann.confirmed }),
    silent: true,
  });
  if (res?.ok) emit("changed");
  else toast(res.error || "操作失败", "error");
}

function startEdit(ann) {
  editingAnnId.value = ann.id;
  editingContent.value = ann.content;
  editingKind.value = kindOf(ann);
}
function cancelEdit() {
  editingAnnId.value = "";
  editingContent.value = "";
}
async function saveEdit() {
  const content = editingContent.value.trim();
  if (!content) return toast("批注内容不能为空", "error");
  editingSaving.value = true;
  try {
    const res = await api(buildUrl(editingAnnId.value), {
      method: "PUT",
      body: JSON.stringify({ content, kind: editingKind.value }),
      silent: true,
    });
    if (res?.ok) {
      toast("已更新");
      cancelEdit();
      emit("changed");
    } else {
      toast(res.error || "更新失败", "error");
    }
  } finally {
    editingSaving.value = false;
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

/* 便利贴：黄底（待确认）/ 绿底（已确认），带轻阴影 */
.sticky {
  padding: 10px 12px;
  background: var(--sticky-bg);
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-sm);
  word-break: break-word;
  transition: background var(--duration-fast) var(--ease-out);
}
/* 类型着色（V2.0）：色相对齐全局 status 变量，浅底保证深/浅主题均可见 */
.sticky-kind-decision { background: oklch(0.95 0.09 255); }
.sticky-kind-risk { background: oklch(0.95 0.09 25); }
.sticky-kind-milestone { background: oklch(0.95 0.09 75); }
.sticky-done {
  background: var(--sticky-bg-confirmed);
}
.sticky-content {
  margin: 0 0 8px; font-size: 13px; line-height: 1.55;
  color: var(--text);
}
.sticky-done .sticky-content { color: var(--text); }
.sticky-foot {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; color: var(--text-secondary);
}
.sticky-foot-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.sticky-foot-left .sticky-kind-tag { flex-shrink: 0; }
.sticky-done .sticky-foot { color: var(--text-secondary); }
.sticky-actions { display: flex; gap: 4px; align-items: center; }

/* 统一图标按钮：无边框，仅 hover 变色 */
.sticky-icon-btn {
  width: 26px; height: 26px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.sticky-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

/* 编辑态：保留类型底色，仅叠加金色高亮边框 */
.sticky.sticky-editing {
  border: 1px solid var(--accent-warm);
  box-shadow: 0 0 0 3px var(--accent-warm-subtle);
}
.sticky-edit-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--accent-warm);
  border-radius: var(--radius-sm);
  font-size: 13px; line-height: 1.55;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  resize: vertical;
  font-family: inherit;
  margin-bottom: 8px;
  min-height: 80px;
}
.sticky-edit-input:focus {
  border-color: var(--accent-warm-hover);
  box-shadow: 0 0 0 3px var(--accent-warm-subtle);
}

/* 保存 / 取消按钮 */
.sticky-save,
.sticky-cancel {
  height: 24px;
  padding: 0 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  border: 1px solid transparent;
}
.sticky-cancel {
  background: transparent;
  border-color: var(--border);
  color: var(--text-secondary);
}
.sticky-cancel:hover { background: var(--bg-hover); border-color: var(--border); color: var(--text); }
.sticky-save {
  background: var(--accent-warm);
  color: var(--bg-card);
  border-color: var(--accent-warm);
}
.sticky-save:hover:not(:disabled) { background: var(--accent-warm-hover); border-color: var(--accent-warm-hover); }
.sticky-save:disabled { opacity: 0.5; cursor: not-allowed; }

/* 类型筛选 chips（V2.0） */
.annot-kind-filter {
  display: flex; gap: 6px; flex-wrap: wrap;
  flex-shrink: 0;
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

/* 类型下拉（V2.0） */
.kind-select {
  width: 110px;
}
.kind-select :deep(.el-select__wrapper) {
  font-size: 12px;
  padding: 0 8px;
}
.annot-compose-kind {
  display: flex;
}
.annot-compose-kind .kind-select { width: 96px; }

/* 输入区：仅未完成态显示 */
.annot-compose {
  border-top: 1px solid var(--border-light);
  padding-top: 10px;
  display: flex; flex-direction: column; gap: 6px;
  flex-shrink: 0;
}
.annot-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 13px; line-height: 1.55;
  background: var(--bg-card);
  color: var(--text);
  outline: none; resize: vertical;
  font-family: inherit;
  min-height: 90px;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.annot-input:focus { border-color: var(--accent-warm); }
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