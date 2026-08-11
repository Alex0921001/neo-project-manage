<template>
  <section class="overview-card">
    <!-- 头部：左右两个平级标题块（项目概览 | 历史总结） -->
    <div class="ov-cols-head">
      <!-- 左标题：项目概览（点击折叠） -->
      <div class="ov-head ov-head-main" @click="expanded = !expanded">
        <svg class="ov-chevron" :class="{ rotated: expanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="ov-title">项目概览</span>
        <span class="ov-spacer"></span>
        <button class="ov-refresh" :class="{ spinning: loading }" title="刷新总结" @click.stop="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          刷新总结
        </button>
      </div>
      <!-- 右标题：历史总结（无数据时整体不显示） -->
      <div v-if="summaries.length" class="ov-head ov-head-tl">
        <span class="ov-tl-title">历史总结</span>
        <span class="ov-tl-count">{{ summaries.length }}</span>
        <span class="ov-tl-spacer"></span>
        <button v-if="summaries.length > TL_LIMIT" class="ov-tl-more" @click="drawerOpen = true">更多 ></button>
      </div>
    </div>

    <div v-show="expanded" class="ov-body">
      <div v-if="loading" class="ov-empty">正在生成总结…</div>
      <div v-else-if="!s" class="ov-empty">暂无数据</div>

      <div v-else class="ov-cols">
        <!-- 左栏：项目概览 -->
        <div class="ov-col ov-col-main">
          <!-- 空项目引导 -->
          <template v-if="isEmpty">
            <p class="ov-empty-text">还没有任务，拆解项目开始规划</p>
            <ul v-if="s.nextSteps?.length" class="ov-steps ov-steps-empty">
              <li v-for="(st, i) in s.nextSteps" :key="i">{{ st }}</li>
            </ul>
          </template>

          <template v-else>
            <!-- 一句话现状 -->
            <p class="ov-summary">{{ s.summary }}</p>

            <!-- 待确认批注 -->
            <div v-if="s.pendingAnnotations?.length" class="ov-metric warn">
              <span class="ov-dot"></span>
              <span>{{ s.pendingAnnotations.length }} 条待确认批注</span>
            </div>

            <!-- 延期任务（红） -->
            <ul v-if="s.delayed?.length" class="ov-delayed">
              <li v-for="(d, i) in s.delayed.slice(0, 3)" :key="i">
                「{{ d.task }}」延期 {{ d.days }} 天
              </li>
              <li v-if="s.delayed.length > 3" class="ov-delayed-more">… 还有 {{ s.delayed.length - 3 }} 个延期任务</li>
            </ul>

            <!-- 风险分级 -->
            <div v-if="s.risks?.length" class="ov-risks">
              <div v-for="(r, i) in s.risks" :key="i" class="ov-risk" :class="'risk-' + r.level">
                {{ r.desc }}
              </div>
            </div>

            <!-- 下一步 -->
            <div v-if="s.nextSteps?.length" class="ov-next">
              <div class="ov-label">下一步</div>
              <ul class="ov-steps">
                <li v-for="(st, i) in s.nextSteps" :key="i">{{ st }}</li>
              </ul>
            </div>
          </template>
        </div>

        <!-- 右栏：历史总结时间线（V2.0 S14）：懒加载，不随概览刷新；无数据不显示 -->
        <div v-if="summaries.length" class="ov-col ov-col-tl">
          <div v-if="tlLoading" class="ov-empty">加载中…</div>
          <div v-else class="ov-tl-scroll">
            <ul class="ov-tl-list">
              <li v-for="(it, i) in shownSummaries" :key="it.id || i" class="ov-tl-item">
                <div class="ov-tl-meta">
                  <span class="ov-tl-time">{{ fmtTime(it.createdAt) }}</span>
                  <span class="ov-tl-src" :class="it.source === 'auto' ? 'src-auto' : 'src-manual'">{{ it.source === 'auto' ? '自动' : '手动' }}</span>
                </div>
                <p class="ov-tl-text">{{ summaryText(it.content) }}</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史总结全部内容：右侧 Drawer（V2.0 精修） -->
    <el-drawer v-model="drawerOpen" title="历史总结" size="420px" :append-to-body="true">
      <!-- 来源筛选：全部 / 自动 / 手动 -->
      <div class="ov-drawer-filter">
        <button
          v-for="opt in SOURCE_FILTERS"
          :key="opt.value"
          class="ov-filter-chip"
          :class="{ active: tlFilter === opt.value }"
          @click="tlFilter = opt.value"
        >{{ opt.label }}</button>
      </div>
      <div v-if="tlLoading" class="ov-empty">加载中…</div>
      <div v-else-if="!filteredSummaries.length" class="ov-empty">暂无该类型总结</div>
      <ul v-else class="ov-tl-list ov-tl-list-drawer">
        <li v-for="(it, i) in filteredSummaries" :key="it.id || i" class="ov-tl-item">
          <div class="ov-tl-meta">
            <span class="ov-tl-time">{{ fmtTime(it.createdAt) }}</span>
            <span class="ov-tl-src" :class="it.source === 'auto' ? 'src-auto' : 'src-manual'">{{ it.source === 'auto' ? '自动' : '手动' }}</span>
          </div>
          <p class="ov-tl-text">{{ summaryText(it.content) }}</p>
        </li>
      </ul>
    </el-drawer>
  </section>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";

const props = defineProps({ projectId: { type: String, default: "" } });

const expanded = ref(true); // 默认展开
const loading = ref(false);
const s = ref(null); // summary data

// ===== 历史总结时间线（V2.0 S14）=====
const TL_LIMIT = 3; // 默认只展示前 3 条，更多内容点「更多 >」进 Drawer 查看
const SOURCE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "auto", label: "自动" },
  { value: "manual", label: "手动" },
]; // Drawer 内来源筛选
const tlLoading = ref(false);
const tlLoaded = ref(false); // 已加载过则缓存，不再重复请求
const summaries = ref([]);
const drawerOpen = ref(false); // 历史总结 Drawer 开关
const tlFilter = ref("all"); // 当前筛选：all / auto / manual
// 展示列表：默认前 3 条（全部内容在 Drawer 中）
const shownSummaries = computed(() => summaries.value.slice(0, TL_LIMIT));
// Drawer 内按来源筛选后的列表
const filteredSummaries = computed(() => {
  if (tlFilter.value === "all") return summaries.value;
  return summaries.value.filter((it) => it.source === tlFilter.value);
});

let inflight = null; // 防并发：请求进行中再次调用复用同一 promise

async function refresh() {
  if (!props.projectId) return;
  if (inflight) return inflight;
  loading.value = true;
  const p = (inflight = api(`api/projects/${props.projectId}/summary`, { silent: true }).finally(() => { inflight = null; }));
  const res = await p;
  loading.value = false;
  // 接口异常时优雅降级：置 null，面板显示「暂无数据」，不抛错
  s.value = res?.ok ? (res.data || null) : null;
  // P1-2：刷新总结后联动失效时间线缓存并重拉，否则新总结永远不可见
  if (res?.ok) {
    tlLoaded.value = false;
    tlLoading.value = false;
    loadSummaries();
  }
}

/** 懒加载历史总结（只拉一次，重复渲染不重复请求） */
async function loadSummaries() {
  if (!props.projectId || tlLoaded.value || tlLoading.value) return;
  tlLoading.value = true;
  const res = await api(`api/projects/${props.projectId}/summaries`, { silent: true });
  tlLoading.value = false;
  tlLoaded.value = true;
  // 接口异常降级为空列表，显示「暂无历史总结」
  summaries.value = res?.ok && Array.isArray(res.data) ? res.data : [];
}

/** ISO 时间 → 本地可读格式 YYYY-MM-DD HH:mm（不用 toISOString，避免 UTC 偏移） */
function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** content 为总结 JSON 字符串：解析后取 summary，兜底 project.name/progress；解析失败显示原文截断 */
function summaryText(raw) {
  if (!raw) return "-";
  try {
    const obj = JSON.parse(raw);
    const s = obj?.summary;
    if (typeof s === "string" && s.trim()) return s.trim();
    const p = obj?.project;
    if (p && (p.name || p.progress != null)) {
      return `${p.name || "项目"}：完成度 ${p.progress ?? 0}%`;
    }
    return "（总结内容为空）";
  } catch {
    // 解析失败：压缩空白后截断展示原文
    const text = raw.replace(/\s+/g, " ").trim();
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  }
}

// projectId 变化：刷新概览 + 重置时间线缓存（避免串项目数据）
watch(
  () => props.projectId,
  () => {
    tlLoaded.value = false;
    tlLoading.value = false;
    summaries.value = [];
    drawerOpen.value = false;
    refresh();
  },
  { immediate: true }
);
defineExpose({ refresh });

const isEmpty = computed(() => {
  if (!s.value) return false;
  return !s.value.completed?.length && !s.value.pending?.length;
});
</script>

<style scoped>
.overview-card {
  flex-shrink: 0;
  margin: 0 24px 24px;
}

/* ===== 头部（左右平级标题） ===== */
.ov-cols-head {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 0;
}
.ov-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ov-head-main {
  flex: 1.4;
  min-width: 0;
  cursor: pointer;
  user-select: none;
}
.ov-head-tl {
  flex: 1;
  min-width: 0;
}
.ov-chevron {
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: transform var(--duration-fast) var(--ease-out);
}
.ov-chevron.rotated { transform: rotate(180deg); }
.ov-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.02em;
}
.ov-spacer { flex: 1; }
.ov-refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}
.ov-refresh:hover {
  color: var(--text);
  background: none;
}
.ov-refresh.spinning svg { animation: ov-spin 0.8s linear infinite; }
@keyframes ov-spin { to { transform: rotate(360deg); } }

/* ===== 内容（左右布局） ===== */
.ov-body {
  padding: 4px 0 14px;
}
.ov-cols {
  display: flex;
  align-items: stretch;
  gap: 20px;
}
.ov-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ov-col-main {
  flex: 1.4;
  padding-left: 20px; /* 与头部标题「项目概览」文字左对齐（chevron 12px + gap 8px） */
}
.ov-col-tl {
  flex: 1;
  min-width: 0;
}
.ov-empty {
  padding: 18px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12.5px;
}
.ov-empty-text {
  padding: 14px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
}
.ov-summary {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 待确认批注（黄） */
.ov-metric {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.ov-metric .ov-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ov-metric.warn {
  color: var(--accent-warm);
  background: var(--accent-warm-subtle);
}
.ov-metric.warn .ov-dot { background: var(--accent-warm); }

/* 延期任务（红） */
.ov-delayed {
  display: flex;
  flex-direction: column;
  gap: 3px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.ov-delayed li {
  font-size: 12px;
  color: var(--status-delay-text);
  line-height: 1.6;
}
.ov-delayed-more { color: var(--text-tertiary); }

/* 风险分级（无圆点，文字左对齐，级别用颜色区分） */
.ov-risks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ov-risk {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.risk-high { color: var(--status-delay-text); }
.risk-medium { color: var(--accent-warm); }
.risk-low { color: var(--text-secondary); }

/* 下一步 */
.ov-next {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ov-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ov-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.ov-steps li {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.ov-steps-empty li { color: var(--text-tertiary); }

/* ===== 历史总结时间线（V2.0 S14）===== */
.ov-tl-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.02em;
}
.ov-tl-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 0 7px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.ov-tl-spacer { flex: 1; }
.ov-tl-more {
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}
.ov-tl-more:hover {
  color: var(--text);
}
.ov-tl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* 滚动容器：列表超 350px 出现滚动条 */
.ov-tl-scroll {
  max-height: 350px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.ov-tl-scroll::-webkit-scrollbar { width: 5px; }
.ov-tl-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
.ov-tl-scroll::-webkit-scrollbar-track { background: transparent; }
/* Drawer 内列表：撑满高度滚动，间距更宽松 */
.ov-tl-list-drawer {
  gap: 16px;
}
.ov-tl-list-drawer .ov-tl-text {
  font-size: 12.5px;
}
/* Drawer 内来源筛选 chips */
.ov-drawer-filter {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.ov-filter-chip {
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  font-family: inherit;
  padding: 3px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.ov-filter-chip:hover {
  border-color: var(--border);
  color: var(--text);
}
.ov-filter-chip.active {
  color: var(--accent-warm);
  border-color: var(--accent-warm);
  background: var(--accent-warm-subtle);
}
.ov-tl-item {
  position: relative;
  padding-left: 16px;
}
/* 竖线（最后一条不延伸） */
.ov-tl-item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: -12px;
  width: 1px;
  background: var(--border-light);
}
/* 圆点 */
.ov-tl-item::after {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border);
  box-shadow: 0 0 0 2px var(--bg-card);
}
.ov-tl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.ov-tl-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.ov-tl-src {
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.ov-tl-src.src-auto {
  color: var(--status-doing-text);
  background: oklch(0.62 0.21 255 / 0.12);
}
.ov-tl-src.src-manual {
  color: var(--accent-warm);
  background: var(--accent-warm-subtle);
}
.ov-tl-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  word-break: break-word;
}
</style>

<style>
/* ===== Drawer 微调（V2.0 精修） =====
 * el-drawer 内容 teleport 到 body，scoped/:deep 无法命中，必须用全局样式 */
.el-drawer__header {
  margin-bottom: 0;
  padding: 20px 20px 0;
}
.el-drawer__header .el-drawer__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
</style>
