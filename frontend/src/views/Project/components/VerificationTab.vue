<template>
  <div class="vtab">
    <!-- ===== 看板视图：对象卡片 + 通用检查项 ===== -->
    <template v-if="view === 'board'">
      <div class="vtab-head">
        <div class="vtab-progress">
          <div class="vtab-progress-bar"><div class="vtab-progress-fill" :style="{ width: progressPct + '%' }"></div></div>
          <span class="vtab-progress-num">{{ summary.done }}/{{ summary.total }}</span>
        </div>
      </div>
      <div class="vtab-cards">
        <div
          v-for="card in summary.cards"
          :key="card.key"
          class="vcard"
          :class="{ 'vcard-general': card.general, 'vcard-done': card.total > 0 && card.done === card.total }"
          @click="openList(card)"
        >
          <div class="vcard-head">
            <span class="vcard-title" :title="card.title">{{ card.title }}</span>
            <span v-if="!card.general" class="vcard-type" :class="card.targetType === 'plan' ? 'is-plan' : 'is-req'">
              {{ card.targetType === 'plan' ? '方案' : '需求' }}
            </span>
            <span class="vcard-count">{{ card.done }}/{{ card.total }}</span>
          </div>
          <div class="vcard-bar"><div :style="{ width: pct(card) + '%' }"></div></div>
          <div v-if="card.general" class="vcard-sub">横切验证：不挂任何单一需求/方案</div>
          <div v-else-if="card.total && card.done === card.total" class="vcard-sub vcard-sub-done">整体验收通过 ✓</div>
          <div v-else-if="card.remainingTitles.length" class="vcard-sub">剩：{{ card.remainingTitles.join(" · ") }}</div>
        </div>
        <div v-if="!summary.total" class="vtab-empty">
          <p class="vtab-empty-title">还没有验证项</p>
          <p class="vtab-empty-sub">在需求/方案详情里补上检查项，或点击下方录入通用横切检查项</p>
        </div>
      </div>
      <!-- 通用项快捷录入 -->
      <div class="vtab-input">
        <input v-model="draft" placeholder="录入通用检查项，回车即存…" @keydown.enter="addGeneral" />
        <button class="vtab-tpl-btn" :disabled="tplLoading" title="标准三件套：功能验证 / 边界与异常 / 回归验证" @click="genGeneral">
          按模板生成 ▾
        </button>
      </div>
    </template>

    <!-- ===== 清单视图：单个对象的验证清单（分类分组） ===== -->
    <template v-else>
      <div class="vtab-head">
        <button class="vtab-back" @click="backToBoard">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回看板
        </button>
        <span class="vtab-list-title">{{ currentCard?.title }}</span>
        <span class="vtab-progress-num">{{ currentCard?.done }}/{{ currentCard?.total }}</span>
      </div>
      <div class="vtab-groups">
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
                @click="toggle(it)"
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
                  <button class="vitem-op vitem-op-danger" @click="askDelete(it)">删除</button>
                </span>
              </template>
            </div>
          </div>
        </div>
        <div v-if="!currentItems.length" class="vtab-empty">该对象还没有验证项</div>
      </div>
      <!-- 录入行：类别选择 + 内容 + 模板 -->
      <div class="vtab-input">
        <el-select v-model="draftCategory" filterable allow-create default-first-option size="small" placeholder="类别" style="width: 130px" popper-class="vtab-select">
          <el-option v-for="c in knownCategories" :key="c" :label="c" :value="c" />
        </el-select>
        <input v-model="draft" placeholder="输入验证内容，回车即存…" @keydown.enter="addItem" />
        <el-dropdown trigger="click" @command="genFor">
          <button class="vtab-tpl-btn" :disabled="tplLoading">按模板生成 ▾</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="standard">标准三件套（功能 / 边界 / 回归）</el-dropdown-item>
              <el-dropdown-item command="ui">UI 走查</el-dropdown-item>
              <el-dropdown-item command="compat">兼容性</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </template>

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

const props = defineProps({
  projectId: { type: String, required: true },
});
const emit = defineEmits(["changed"]);

const view = ref("board"); // board | list
const summary = ref({ total: 0, done: 0, cards: [] });
const currentCard = ref(null);
const items = ref([]);
const draft = ref("");
const draftCategory = ref("功能验证");
const tplLoading = ref(false);
const editingId = ref("");
const editDraft = ref("");
const foldedGroups = ref(new Set());

const confirm = reactive({ show: false, message: "", payload: null });

const progressPct = computed(() => (summary.value.total ? Math.round((summary.value.done / summary.value.total) * 100) : 0));
const knownCategories = computed(() => {
  const set = new Set(["功能验证", "边界与异常", "回归验证"]);
  items.value.forEach((i) => i.category && set.add(i.category));
  summary.value.cards.forEach((c) => c.items?.forEach((i) => i.category && set.add(i.category)));
  return [...set];
});
const currentItems = computed(() => (currentCard.value?.key === "__general__" ? items.value : items.value));
const groupedItems = computed(() => {
  const map = new Map();
  for (const it of currentItems.value) {
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

function pct(card) {
  return card.total ? Math.round((card.done / card.total) * 100) : 0;
}
function fmtTime(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let loadSeq = 0;
async function loadSummary() {
  const seq = ++loadSeq;
  const res = await api(`api/projects/${props.projectId}/verifications/summary`);
  if (seq !== loadSeq || !res?.ok) return;
  summary.value = res.data;
}
async function loadItems(card) {
  const seq = ++loadSeq;
  const qs = card.general ? "" : `&targetType=${card.targetType}&targetId=${card.targetId}`;
  const res = await api(`api/projects/${props.projectId}/verifications?self=1${qs}`);
  if (seq !== loadSeq || !res?.ok) return;
  items.value = res.data.items || [];
}

async function refresh() {
  if (view.value === "board") {
    await loadSummary();
  } else if (currentCard.value) {
    await loadItems(currentCard.value);
    await loadSummary();
  }
}

function openList(card) {
  currentCard.value = card;
  view.value = "list";
  foldedGroups.value = new Set();
  loadItems(card);
}
function backToBoard() {
  view.value = "board";
  currentCard.value = null;
  loadSummary();
  emit("changed");
}

function toggleGroup(name) {
  const next = new Set(foldedGroups.value);
  next.has(name) ? next.delete(name) : next.add(name);
  foldedGroups.value = next;
}

async function addItem() {
  const content = draft.value.trim();
  if (!content) return;
  const general = currentCard.value?.general;
  const body = { content, category: draftCategory.value || "" };
  if (!general) {
    body.targetType = currentCard.value.targetType;
    body.targetId = currentCard.value.targetId;
  }
  const res = await api(`api/projects/${props.projectId}/verifications`, { method: "POST", body: JSON.stringify(body) });
  if (res?.ok) {
    // 乐观追加（分组按 category 动态渲染）
    items.value.push(res.data);
    draft.value = "";
    emit("changed");
  } else {
    toast(res?.error || "录入失败", "error");
  }
}
async function addGeneral() {
  // 看板视图的通用项快捷录入
  const content = draft.value.trim();
  if (!content) return;
  const res = await api(`api/projects/${props.projectId}/verifications`, {
    method: "POST",
    body: JSON.stringify({ content, category: "" }),
  });
  if (res?.ok) {
    draft.value = "";
    loadSummary();
    emit("changed");
    toast("已录入通用检查项");
  } else {
    toast(res?.error || "录入失败", "error");
  }
}
async function genFor(key) {
  tplLoading.value = true;
  const body = { templateKey: key };
  if (view.value === "list" && currentCard.value && !currentCard.value.general) {
    body.targetType = currentCard.value.targetType;
    body.targetId = currentCard.value.targetId;
  }
  const res = await api(`api/projects/${props.projectId}/verifications/template`, { method: "POST", body: JSON.stringify(body) });
  tplLoading.value = false;
  if (res?.ok) {
    toast(`已生成 ${res.data.length} 条空检查项，逐条补内容`);
    refresh();
    emit("changed");
  } else {
    toast(res?.error || "生成失败", "error");
  }
}
const genGeneral = () => genFor("standard");

async function toggle(it) {
  // 乐观切换，失败回滚
  const prev = it.status;
  it.status = !prev;
  const res = await api(`api/projects/${props.projectId}/verifications/${it.id}/toggle`, { method: "POST" });
  if (res?.ok) {
    Object.assign(it, res.data);
    emit("changed");
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
  const res = await api(`api/projects/${props.projectId}/verifications/${it.id}`, {
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

function askDelete(it) {
  confirm.payload = it;
  confirm.message = `删除验证项「${it.content.slice(0, 30)}」？`;
  confirm.show = true;
}
async function doConfirm() {
  confirm.show = false;
  const it = confirm.payload;
  const res = await api(`api/projects/${props.projectId}/verifications/${it.id}`, { method: "DELETE" });
  if (res?.ok) {
    items.value = items.value.filter((x) => x.id !== it.id);
    emit("changed");
    toast("已删除");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}

watch(() => props.projectId, () => {
  view.value = "board";
  currentCard.value = null;
  loadSummary();
}, { immediate: true });

defineExpose({ reload: refresh });
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
.vtab-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vtab-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.vtab-back:hover { background: var(--bg-hover); color: var(--text); }

/* 看板卡片 */
.vtab-cards {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  align-content: start;
}
.vcard {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-card);
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.vcard:hover { border-color: var(--accent); background: var(--accent-light); }
.vcard-general { border-style: dashed; }
.vcard-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}
.vcard-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcard-type {
  flex: none;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 9px;
}
.vcard-type.is-plan { background: var(--accent-light); color: var(--accent-hover); }
.vcard-type.is-req { background: var(--accent-light); color: var(--accent-hover); }
.vcard-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.vcard-bar {
  height: 5px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}
.vcard-bar > div {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
}
.vcard-done .vcard-bar > div { background: var(--status-done-text); }
.vcard-sub {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcard-sub-done { color: var(--status-done-text); }

/* 清单分组 */
.vtab-groups {
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
.vgroup-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
}
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

/* 录入行 */
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
.vtab-tpl-btn {
  flex: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  padding: 3px 9px;
  cursor: pointer;
  white-space: nowrap;
}
.vtab-tpl-btn:hover:not(:disabled) { background: var(--accent-light); }
.vtab-tpl-btn:disabled { color: var(--text-tertiary); cursor: not-allowed; }
.vtab-empty {
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
  padding: 20px 0;
}
.vtab-empty-title {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 4px;
}
.vtab-empty-sub { margin: 0; font-size: 11.5px; }
</style>
