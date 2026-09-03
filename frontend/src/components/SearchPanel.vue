<template>
  <FloatPanel
    :model-value="modelValue"
    :title="title || (isProject ? '项目内搜索' : '全局搜索')"
    :default-width="780"
    :default-height="540"
    :min-width="520"
    :min-height="360"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="search-panel">
      <!-- 搜索输入 -->
      <div class="search-input-row">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          ref="inputRef"
          v-model="keyword"
          class="search-input"
          placeholder="搜索项目 / 任务 / 批注 / 方案 / 需求 / 评论 / 验证 / 备注 / 文件 / 临时任务（中文 3 字以上全量检索，1~2 字模糊匹配）"
        />
        <button v-if="keyword" class="search-clear" title="清空" @click="keyword = ''">×</button>
      </div>

      <!-- 首次建索引动效：已索引项目数 < 项目总数时提示 -->
      <div v-if="indexing" class="indexing-banner">
        <span class="indexing-dot"></span>
        正在建立索引…（已索引 {{ indexed }} / {{ projectCount }} 个项目，构建完成后自动恢复完整搜索）
      </div>

      <!-- 结果区 -->
      <div v-if="!keyword.trim()" class="search-hint">
        <p>输入关键词开始搜索</p>
        <p class="hint-sub">支持项目名 / 描述、任务名 / 描述 / 批注、方案标题 / 内容、需求、评论、验证卡 / 验证项 / 验证分组、备注、文件名、临时任务；回车或输入即搜</p>
      </div>
      <div v-else-if="loading" class="search-state">搜索中…</div>
      <div v-else-if="!hasResults" class="search-state">未找到相关内容</div>
      <div v-else class="search-results">
        <div v-for="g in groups" :key="g.type" class="result-group">
          <div v-if="g.items.length" class="group-head">{{ g.label }}（{{ g.items.length }}）</div>
          <div
            v-for="r in g.items"
            :key="r.type + '|' + r.refId"
            class="result-item"
            @click="go(r)"
          >
            <div v-if="showTitle(r)" class="field-row">
              <span class="field-label">标题</span>
              <span class="field-value" v-html="highlightKeyword(displayTitle(r), keyword)"></span>
            </div>
            <div v-if="showContent(r)" class="field-row">
              <span class="field-label">内容</span>
              <span class="field-value secondary" v-html="renderContent(r)"></span>
            </div>
            <div class="field-row">
              <span class="field-label">所属项目</span>
              <span class="field-value secondary">{{ r.projectName || '—' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </FloatPanel>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import FloatPanel from "./FloatPanel.vue";
import { api } from "../api.js";
import { jumpToResult, renderSnippet, highlightKeyword } from "../utils/jump.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  projectId: { type: String, default: "" }, // 空 = 全局搜索
  title: { type: String, default: "" },
});
defineEmits(["update:modelValue"]);

const isProject = computed(() => !!props.projectId);
const keyword = ref("");
const results = ref([]);
const loading = ref(false);
const indexed = ref(0);
const projectCount = ref(0);
const indexing = ref(false);

// ===== 分组定义（展示顺序固定：项目组最前；V2.6.1 补评论/验证体系/临时任务） =====
const TYPE_GROUPS = [
  { type: "project", label: "项目" },
  { type: "task", label: "任务" },
  { type: "annotation", label: "批注" },
  { type: "plan", label: "方案" },
  { type: "requirement", label: "需求" },
  { type: "comment", label: "评论" },
  { type: "verification", label: "验证卡" },
  { type: "verification_item", label: "验证项" },
  { type: "verification_category", label: "验证分组" },
  { type: "note", label: "备注" },
  { type: "file", label: "文件" },
  { type: "quick-task", label: "临时任务" },
];
// 项目内搜索：目标项目就是当前项目，搜出「项目自身」一条无意义，隐藏项目组
const groups = computed(() =>
  TYPE_GROUPS
    .filter((g) => !(isProject.value && g.type === "project"))
    .map((g) => ({
      ...g,
      items: results.value.filter((r) => r.type === g.type),
    }))
);
const hasResults = computed(() => results.value.length > 0);

// ===== 防抖搜索（300ms）=====
let timer = null;
let reqSeq = 0; // 请求序号：后发响应优先，旧响应丢弃（防快速输入竞态）
watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(search, 300);
});

async function loadProjectCount() {
  // 全局搜索：拉项目总数判断索引进度；项目内搜索不依赖（索引已含本项目）
  if (isProject.value) return;
  const res = await api("api/projects", { silent: true });
  if (res?.ok) projectCount.value = (res.data || []).length;
}

async function search() {
  const kw = keyword.value.trim();
  if (!kw) { results.value = []; loading.value = false; return; }
  const seq = ++reqSeq;
  loading.value = true;
  try {
    const params = new URLSearchParams({ keyword: kw, limit: "20" });
    if (isProject.value) params.set("projectId", props.projectId);
    const res = await api(`api/search?${params.toString()}`, { silent: true });
    if (seq !== reqSeq) return; // 已有后发请求，丢弃本次旧响应
    if (res?.ok) {
      results.value = res.data.results || [];
      indexed.value = res.data.indexed || 0;
      // 索引动效：以 fts_meta full_indexed 标志为准（避免空项目无 entry 导致已索引数 < 项目数永不消失）
      indexing.value = !isProject.value && projectCount.value > 0 && res.data.fullIndexed === false;
    } else {
      results.value = [];
    }
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

// ===== 跳转 =====
function go(r) {
  // project：projectId=refId=项目 id，事件 → App 打开对应项目页（jump 协议无需扩展）
  jumpToResult({ type: r.type, projectId: r.projectId, refId: r.refId });
}

// ===== 展示层（V2.3 全局搜索优化：固定三行【标题】【内容】【所属项目】，标题与内容均带命中高亮） =====

/**
 * 标题短名称：task/plan/requirement/file/project 用后端 name/title 原样；
 * annotation/note 是内容截断文本，展示层再压到前 20 字（内容行/所属项目行补全信息）。
 * 标题高亮由 highlightKeyword 渲染：keyword 命中位置包 <mark>，与内容行同款样式。
 */
function displayTitle(r) {
  if (r.type === "annotation" || r.type === "note" || r.type === "comment" || r.type === "verification_item") {
    const t = String(r.title ?? "");
    return t.length > 20 ? `${t.slice(0, 20)}…` : t;
  }
  return r.title;
}

/**
 * 按类型自适应三段式（用户方案 A）：
 * 任务/方案/需求/项目/验证卡/验证分组：标题 + 内容 + 所属项目；
 * 批注/备注/评论/验证项：内容 + 所属项目（无独立标题，避免截断标题与内容重复）；
 * 文件/临时任务：标题 + 所属项目（临时任务无项目归属）。
 */
function showTitle(r) {
  return r.type !== "annotation" && r.type !== "note" && r.type !== "comment" && r.type !== "verification_item";
}
function showContent(r) {
  if (r.type === "file" || r.type === "verification_category" || r.type === "quick-task") return false;
  if (r.type === "annotation" || r.type === "note" || r.type === "comment" || r.type === "verification_item") return true;
  if (r.type === "project") return !!r.snippet && r.snippet !== r.title;
  return !!r.snippet;
}
function renderContent(r) {
  // 内容行：优先后端命中片段（带 <mark>，renderSnippet 还原）；无片段时回退标题并前端高亮
  return r.snippet ? renderSnippet(r.snippet) : highlightKeyword(r.title || "", keyword);
}

// ===== 打开面板时：清空旧结果，重新拉项目数（全局），并聚焦搜索框 =====
const inputRef = ref(null);
watch(() => props.modelValue, (v) => {
  if (v) {
    keyword.value = "";
    results.value = [];
    loadProjectCount();
    // autofocus 在弹窗/面板场景常不生效，显式 nextTick 后聚焦
    nextTick(() => inputRef.value?.focus());
  }
});

onMounted(loadProjectCount);
onUnmounted(() => clearTimeout(timer));
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 14px;
  gap: 10px;
  min-height: 0;
}
.search-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  flex-shrink: 0;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.search-input-row:focus-within { border-color: var(--accent-warm); }
.search-icon { color: var(--text-tertiary); flex-shrink: 0; }
.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-clear {
  border: none;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.search-clear:hover { color: var(--text); }

.indexing-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  font-size: 12px;
  flex-shrink: 0;
}
.indexing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-warm);
  animation: indexing-pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes indexing-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.search-hint, .search-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-tertiary);
  font-size: 13px;
}
.hint-sub { font-size: 11.5px; opacity: 0.8; }

.search-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.result-group { display: flex; flex-direction: column; gap: 6px; }
.group-head {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-tertiary);
  padding: 2px 4px;
  letter-spacing: 0.03em;
}
/* 卡片形态：边框 + 圆角 + 内边距 + hover 高亮，条目间距分割清晰 */
.result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out),
              background var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}
.result-item:hover {
  background: var(--bg-hover);
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
}
/* 三行字段标签：灰字小号固定标签 + 正常字号值 */
.field-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.field-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
.field-value {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-value.secondary { color: var(--text-secondary); }
/* 命中高亮（后端 snippet 的 <mark>，转义后还原） */
.result-item :deep(mark) {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  border-radius: 2px;
  padding: 0 1px;
  font-weight: 600;
}
</style>
