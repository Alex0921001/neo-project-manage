<template>
  <FloatPanel
    :model-value="modelValue"
    title="消息中心"
    :default-width="900"
    :default-height="540"
    :min-width="640"
    :min-height="400"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="msg-panel">
      <!-- header：搜索 + 类型 tab + 删除 -->
      <div class="msg-header">
        <div class="msg-search-row">
          <svg class="msg-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="searchWord" class="msg-search" placeholder="按内容过滤消息" />
          <button v-if="searchWord" class="msg-search-clear" title="清空" @click="searchWord = ''">×</button>
        </div>
        <div class="msg-type-tabs">
          <button
            v-for="t in typeTabs"
            :key="t.value"
            :class="['msg-type-tab', { active: typeFilter === t.value }]"
            @click="typeFilter = t.value"
          >
            {{ t.label }}
            <span v-if="t.count" class="msg-type-count">{{ t.count }}</span>
          </button>
        </div>
        <button class="msg-btn" title="全部标为已读" @click="markAllRead">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          全部已读
        </button>
        <button class="msg-btn msg-btn-danger" :disabled="!selected" title="删除当前打开的消息" @click="askDelete()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          删除
        </button>
        <!-- V2.3 精修二批：设置按钮移到删除按钮右侧 -->
        <button class="msg-btn" title="消息提醒配置" @click="openConfig">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      <!-- 主体：左列表 + 右详情 -->
      <div class="msg-body">
        <!-- 左：消息列表（滚动到底加载更多） -->
        <div ref="listRef" class="msg-list" @scroll="onListScroll">
          <div v-if="!filtered.length" class="msg-empty">
            {{ loading ? "加载中…" : "暂无消息" }}
          </div>
          <div
            v-for="m in visibleItems"
            :key="m.id"
            :class="['msg-item', { selected: selected?.id === m.id, unread: !m.read }]"
            @click="select(m)"
            @contextmenu.prevent.stop="openCtxMenu($event, m)"
          >
            <div class="msg-item-head">
              <span class="msg-item-title" v-html="highlight(m.title)"></span>
              <span v-if="!m.read" class="msg-dot" title="未读"></span>
            </div>
            <div class="msg-item-meta">
              <span class="msg-type-label">{{ typeLabel(m.type) }}</span>
              <span class="msg-time">{{ fmtTime(m.createdAt) }}</span>
            </div>
          </div>
          <!-- V2.3 精修二批：加载更多仅在“有数据且未加载完”时显示（空列表/搜索无结果只显示空态） -->
          <div v-if="filtered.length && hasMore" class="msg-load-more">加载更多…</div>
          <div v-else-if="filtered.length" class="msg-list-end">已全部加载</div>
        </div>

        <!-- 右：详情 -->
        <div class="msg-detail">
          <template v-if="selected">
            <h3 class="msg-detail-title">{{ selected.title }}</h3>
            <div class="msg-detail-meta">
              <span>{{ typeLabel(selected.type) }}</span>
              <span>{{ fmtTime(selected.createdAt) }}</span>
              <span v-if="selected.read" class="msg-read-mark">已读</span>
              <span v-else class="msg-read-mark unread">未读</span>
            </div>
            <pre class="msg-detail-content" v-html="highlight(selected.content)"></pre>
            <div v-if="selected.refTaskId || selected.refPlanId" class="msg-detail-refs">
              <button v-if="selected.refTaskId" class="msg-ref-btn" @click="goRef('task', selected.refTaskId)">
                → 查看任务详情
              </button>
              <button v-if="selected.refPlanId" class="msg-ref-btn" @click="goRef('plan', selected.refPlanId)">
                → 查看方案详情
              </button>
            </div>
          </template>
          <div v-else class="msg-detail-empty">选择左侧消息查看明细</div>
        </div>
      </div>
    </div>

    <!-- V2.3 精修二批：右键菜单（定位鼠标处，点击其他区域关闭；删除项弹二次确认） -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.show"
        class="msg-ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px', zIndex: ctxMenu.z }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <div class="msg-ctx-item danger" @click="ctxDelete">删除</div>
      </div>
    </Teleport>

    <!-- 删除二次确认（复用项目内确认交互模式） -->
    <ConfirmModal
      :show="confirmShow"
      message="确认删除该消息？删除后不可恢复。"
      confirm-text="删除"
      @close="confirmShow = false"
      @confirm="doDelete"
    />

    <!-- V2.3 精修 #7：消息提醒配置弹窗 -->
    <el-dialog
      v-model="configShow"
      title="消息提醒配置"
      width="420px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="msg-config-form">
        <div class="msg-config-row">
          <span class="msg-config-label">到期提醒提前天数</span>
          <el-select v-model="cfgForm.deadlineDays" style="width: 120px">
            <el-option v-for="d in [1, 2, 3, 7, 14]" :key="d" :label="`${d} 天`" :value="d" />
          </el-select>
        </div>
        <div class="msg-config-row">
          <span class="msg-config-label">到期提醒</span>
          <el-switch v-model="cfgForm.deadlineEnabled" />
          <span class="msg-config-hint">关闭后不再生成新的到期提醒消息（历史消息保留）</span>
        </div>
        <div class="msg-config-row">
          <span class="msg-config-label">风险提醒</span>
          <el-switch v-model="cfgForm.riskEnabled" />
          <span class="msg-config-hint">关闭后不再生成新的风险提醒消息（历史消息保留）</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="configShow = false">取消</el-button>
        <el-button type="primary" :loading="configSaving" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </FloatPanel>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import FloatPanel from "../../components/FloatPanel.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";
import { api } from "../../api.js";
import { toast } from "../../toast.js";
import { jumpToResult, highlightKeyword } from "../../utils/jump.js";
import { nextZIndex } from "../../utils/zIndex.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "changed"]);

// ===== 数据 =====
const loading = ref(false);
const selected = ref(null);
const searchWord = ref("");
const typeFilter = ref("all");
const confirmShow = ref(false);

const typeTabs = computed(() => {
  // 计数基于已加载数据（分页加载中，非全量；打开滚动加载可补全）
  const count = (t) => (t === "all" ? items.value.length : items.value.filter((m) => m.type === t).length);
  return [
    { value: "all", label: "全部", count: count("all") },
    { value: "deadline", label: "到期提醒", count: count("deadline") },
    { value: "risk", label: "风险提醒", count: count("risk") },
  ];
});

function typeLabel(t) {
  return { deadline: "到期提醒", risk: "风险提醒" }[t] || t || "";
}

// ===== 过滤（搜索词命中 title/content，基于已加载数据） =====
const filtered = computed(() => {
  const kw = searchWord.value.trim().toLowerCase();
  return items.value.filter((m) => {
    if (m.type === "synergy") return false; // V2.3 决策：协同通知不做了，过滤不展示
    if (typeFilter.value !== "all" && m.type !== typeFilter.value) return false;
    if (!kw) return true;
    return (m.title || "").toLowerCase().includes(kw) || (m.content || "").toLowerCase().includes(kw);
  });
});

// ===== 分页：后端 limit/offset 滚动加载（每页 20；搜索时同样继续拉取补全后再过滤） =====
const PAGE_SIZE = 20;
const items = ref([]); // 已加载消息（按页追加）
const total = ref(0);
const visibleItems = computed(() => filtered.value); // 已加载范围内过滤展示
const hasMore = computed(() => items.value.length < total.value);

async function loadMore() {
  if (loading.value) return;
  if (items.value.length > 0 && !hasMore.value) return;
  loading.value = true;
  try {
    const offset = items.value.length;
    const res = await api(`api/messages?limit=${PAGE_SIZE}&offset=${offset}`, { silent: true });
    if (res?.ok) {
      const page = res.data.items || [];
      if (!page.length) {
        // 后端返回空页（offset 超界）：收敛 total 防无限加载循环
        total.value = items.value.length;
        return;
      }
      // 去重追加（幂等保护，防重复加载同一条）
      const known = new Set(items.value.map((m) => m.id));
      for (const m of page) if (!known.has(m.id)) items.value.push(m);
      total.value = res.data.total || items.value.length;
      // 打开后自动选中第一条未读（review 口径：选中即标记已读并同步角标）
      if (!selected.value && items.value.length) {
        const firstUnread = items.value.find((m) => !m.read);
        select(firstUnread || items.value[0]);
      }
    }
  } finally {
    loading.value = false;
  }
}

function onListScroll(e) {
  const el = e.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) loadMore();
}

// ===== 高亮命中词（琥珀色；与全局搜索 SearchPanel 同款逻辑/样式，共用 highlightKeyword） =====
function highlight(text) {
  return highlightKeyword(text, searchWord.value);
}

// ===== 选择 =====
function select(m) {
  if (!m) return;
  selected.value = m;
  if (!m.read) markRead(m.id);
}

// ===== 已读 / 删除 =====
async function markRead(id) {
  const res = await api("api/messages/read", {
    method: "PUT",
    body: JSON.stringify({ ids: [id] }),
    silent: true,
  });
  if (res?.ok) {
    const m = items.value.find((x) => x.id === id);
    if (m) m.read = true;
    emit("changed");
  }
}

/**
 * 全部已读：拉全量消息取未读 id（分批 ≤50/次，对齐后端批量上限），标记后刷新角标
 */
async function markAllRead() {
  // 拉全量（消息量小，limit=100 翻页兜底）
  let allMsgs = [];
  let offset = 0;
  while (true) {
    const res = await api(`api/messages?limit=100&offset=${offset}`, { silent: true });
    if (!res?.ok) break;
    const page = res.data.items || [];
    allMsgs = allMsgs.concat(page);
    if (allMsgs.length >= (res.data.total || 0)) break;
    if (!page.length) break;
    offset += page.length;
  }
  const unreadIds = allMsgs.filter((m) => !m.read).map((m) => m.id);
  if (!unreadIds.length) return toast("没有未读消息", "info");
  // 分批标记（后端批量上限 50）
  for (let i = 0; i < unreadIds.length; i += 50) {
    await api("api/messages/read", {
      method: "PUT",
      body: JSON.stringify({ ids: unreadIds.slice(i, i + 50) }),
      silent: true,
    });
  }
  for (const m of items.value) m.read = true;
  emit("changed");
  toast(`已标记 ${unreadIds.length} 条未读消息`);
}

// ===== 右键菜单（V2.3 精修二批：右键列表项 → 小菜单「删除」→ 二次确认 → 删除并刷新角标） =====
const ctxMenu = ref({ show: false, x: 0, y: 0, z: 4000, msg: null });

function openCtxMenu(e, m) {
  if (!m) return;
  // 定位鼠标处，边界钳制防溢出视口（菜单约 110×36）
  const MENU_W = 110;
  const MENU_H = 38;
  ctxMenu.value = {
    show: true,
    x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
    y: Math.min(e.clientY, window.innerHeight - MENU_H - 8),
    z: nextZIndex(), // 动态取层级，盖过浮动面板
    msg: m,
  };
}

function closeCtxMenu() {
  ctxMenu.value.show = false;
}

function ctxDelete() {
  const m = ctxMenu.value.msg;
  closeCtxMenu();
  if (m) askDelete(m);
}

// 点击其他区域 / 再次右键 / ESC / 滚动时关闭
function onDocPointer() {
  closeCtxMenu();
}
function onDocKey(e) {
  if (e.key === "Escape") closeCtxMenu();
}
onMounted(() => {
  document.addEventListener("click", onDocPointer);
  document.addEventListener("contextmenu", onDocPointer);
  document.addEventListener("keydown", onDocKey);
  window.addEventListener("scroll", onDocPointer, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", onDocPointer);
  document.removeEventListener("contextmenu", onDocPointer);
  document.removeEventListener("keydown", onDocKey);
  window.removeEventListener("scroll", onDocPointer, true);
});

// 删除确认：pendingDelete 记录目标（右键列表项 / header 删除当前选中），删除后按目标是否当前选中决定是否切换选中
const pendingDelete = ref(null);
function askDelete(m = null) {
  const target = m || selected.value;
  if (!target) return;
  pendingDelete.value = target;
  confirmShow.value = true;
}

async function doDelete() {
  const m = pendingDelete.value;
  if (!m) return;
  confirmShow.value = false;
  pendingDelete.value = null;
  const res = await api(`api/messages/${m.id}`, { method: "DELETE", silent: true });
  if (res?.ok) {
    toast("已删除");
    items.value = items.value.filter((x) => x.id !== m.id);
    if (selected.value?.id === m.id) {
      selected.value = items.value.find((x) => !x.read) || items.value[0] || null;
    }
    emit("changed");
  } else {
    toast(res?.error || "删除失败", "error");
  }
}

// ===== V2.3 精修 #7：消息提醒配置弹窗 =====
const configShow = ref(false);
const configSaving = ref(false);
const cfgForm = ref({ deadlineDays: 3, deadlineEnabled: true, riskEnabled: true });

async function openConfig() {
  const res = await api("api/messages/config", { silent: true });
  if (res?.ok && res.data?.config) cfgForm.value = { ...res.data.config };
  configShow.value = true;
}

async function saveConfig() {
  configSaving.value = true;
  try {
    const res = await api("api/messages/config", {
      method: "PUT",
      body: JSON.stringify({
        deadlineDays: Number(cfgForm.value.deadlineDays),
        deadlineEnabled: !!cfgForm.value.deadlineEnabled,
        riskEnabled: !!cfgForm.value.riskEnabled,
      }),
      silent: true,
    });
    if (res?.ok) {
      cfgForm.value = { ...res.data.config };
      toast("配置已保存");
      configShow.value = false;
    } else {
      toast(res?.error || "保存失败", "error");
    }
  } finally {
    configSaving.value = false;
  }
}

// ===== ref 跳转（聚合消息暂无 ref；项目级消息未来带 projectId 时可跳，synergy 预留能力） =====
function goRef(type, refId) {
  const pid = selected.value?.projectId;
  if (!pid) return;
  jumpToResult({ type, projectId: pid, refId });
}

// ===== 时间 =====
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ===== 打开时：重置筛选 + 加载第一页 =====
watch(() => props.modelValue, (v) => {
  if (v) {
    searchWord.value = "";
    typeFilter.value = "all";
    items.value = [];
    total.value = 0;
    selected.value = null;
    loadMore();
  }
});
</script>

<style scoped>
.msg-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.msg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.msg-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  width: 200px;
  flex-shrink: 0;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.msg-search-row:focus-within { border-color: var(--accent-warm); }
.msg-search-icon { color: var(--text-tertiary); flex-shrink: 0; }
.msg-search {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--text);
}
.msg-search::placeholder { color: var(--text-tertiary); }
.msg-search-clear {
  border: none;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.msg-type-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}
.msg-type-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-out);
}
.msg-type-tab:hover { background: var(--bg-hover); color: var(--text); }
.msg-type-tab.active { background: var(--bg-active); color: var(--text); font-weight: 700; }
.msg-type-count {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  line-height: 1.4;
}
.msg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12.5px;
  cursor: pointer;
  flex-shrink: 0;
  /* V2.3 精修二批：统一高度与行高，纯图标按钮（设置）与文字按钮对齐 */
  height: 30px;
  line-height: 1;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-out);
}
.msg-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); border-color: var(--border); }
.msg-btn-danger:hover:not(:disabled) { background: #fdecec; color: var(--danger); border-color: var(--danger); }
.msg-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 右键菜单（V2.3 精修二批，风格对齐项目内 ctx-menu：黑白灰简洁浮层） */
.msg-ctx-menu {
  position: fixed;
  min-width: 110px;
  padding: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.msg-ctx-item {
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
  user-select: none;
  transition: background var(--duration-fast) var(--ease-out);
}
.msg-ctx-item:hover { background: var(--bg-hover); }
.msg-ctx-item.danger { color: var(--danger); }
.msg-ctx-item.danger:hover { background: #fdecec; }

/* 消息提醒配置弹窗 */
.msg-config-form { display: flex; flex-direction: column; gap: 14px; }
.msg-config-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.msg-config-label {
  width: 110px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.msg-config-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.msg-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.msg-list {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border-light);
  padding: 6px;
}
.msg-item {
  padding: 8px 9px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.msg-item:hover { background: var(--bg-hover); }
.msg-item.selected { background: var(--accent-warm-subtle); }
.msg-item-head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.msg-item-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
.msg-item.unread .msg-item-title { font-weight: 700; }
.msg-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-warm);
  flex-shrink: 0;
  margin-top: 4px;
}
.msg-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.msg-type-label {
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  font-weight: 600;
}
.msg-empty {
  padding: 40px 12px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12.5px;
}
.msg-load-more {
  padding: 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.msg-list-end {
  padding: 8px;
  text-align: center;
  font-size: 11px;
  color: var(--border);
}

.msg-detail {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg-detail-title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.5;
}
.msg-detail-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.msg-read-mark { color: var(--status-done-text); font-weight: 600; }
.msg-read-mark.unread { color: var(--accent-warm); }
.msg-detail-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--bg);
  border: 1px solid var(--border-light);
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-all;
}
.msg-detail-refs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.msg-ref-btn {
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--link);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.msg-ref-btn:hover { border-color: var(--link); background: var(--bg-hover); }
.msg-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
/* 搜索命中高亮（与 SearchPanel 完全一致：同 background/color/border-radius/padding/font-weight）
   作用于整个面板（列表标题 + 右侧详情内容），两处保持一致 */
.msg-panel :deep(mark) {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  border-radius: 2px;
  padding: 0 1px;
  font-weight: 600;
}
</style>
