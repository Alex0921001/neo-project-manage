<template>
  <section class="overview-card">
    <!-- 头部：点击折叠 / 刷新 -->
    <div class="ov-head" @click="expanded = !expanded">
      <svg class="ov-chevron" :class="{ rotated: expanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      <span class="ov-title">项目概览</span>
      <span v-if="s" class="ov-status" :class="statusClass(s.project?.status)">{{ s.project?.status }}</span>
      <span class="ov-spacer"></span>
      <button class="ov-refresh" :class="{ spinning: loading }" title="刷新总结" @click.stop="refresh">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        刷新总结
      </button>
    </div>

    <div v-show="expanded" class="ov-body">
      <div v-if="loading" class="ov-empty">正在生成总结…</div>
      <div v-else-if="!s" class="ov-empty">暂无数据</div>

      <!-- 空项目引导 -->
      <template v-else-if="isEmpty">
        <p class="ov-empty-text">还没有任务，拆解项目开始规划</p>
        <ul v-if="s.nextSteps?.length" class="ov-steps ov-steps-empty">
          <li v-for="(st, i) in s.nextSteps" :key="i">{{ st }}</li>
        </ul>
      </template>

      <template v-else>
        <!-- 一句话现状 -->
        <p class="ov-summary">{{ s.summary }}</p>

        <!-- 完成度 + 待确认批注 -->
        <div class="ov-grid">
          <div class="ov-progress">
            <div class="ov-label">完成度</div>
            <div class="ov-progress-row">
              <div class="progress-track"><div class="progress-fill" :style="{ width: progress + '%' }"></div></div>
              <span class="progress-num">{{ progress }}%</span>
            </div>
          </div>
          <div v-if="s.pendingAnnotations?.length" class="ov-metric warn">
            <span class="ov-dot"></span>
            <span>{{ s.pendingAnnotations.length }} 条待确认批注</span>
          </div>
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
            <span class="ov-risk-dot"></span>
            <span class="ov-risk-desc">{{ r.desc }}</span>
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

      <!-- 历史总结时间线（V2.0 S14）：独立折叠块，懒加载，不随概览刷新 -->
      <div class="ov-tl">
        <div class="ov-tl-head" @click="toggleTimeline">
          <svg class="ov-chevron" :class="{ rotated: tlExpanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="ov-tl-title">历史总结</span>
          <span v-if="summaries.length" class="ov-tl-count">{{ summaries.length }}</span>
        </div>
        <div v-show="tlExpanded" class="ov-tl-body">
          <div v-if="tlLoading" class="ov-empty">加载中…</div>
          <div v-else-if="!summaries.length" class="ov-empty">暂无历史总结</div>
          <ul v-else class="ov-tl-list">
            <li v-for="(it, i) in summaries" :key="it.id || i" class="ov-tl-item">
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
const tlExpanded = ref(false); // 默认折叠
const tlLoading = ref(false);
const tlLoaded = ref(false); // 已加载过则缓存，切换折叠不再重复请求
const summaries = ref([]);

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
}

/** 展开时懒加载历史总结（只拉一次，折叠/展开不重复请求） */
async function loadSummaries() {
  if (!props.projectId || tlLoaded.value || tlLoading.value) return;
  tlLoading.value = true;
  const res = await api(`api/projects/${props.projectId}/summaries`, { silent: true });
  tlLoading.value = false;
  tlLoaded.value = true;
  // 接口异常降级为空列表，显示「暂无历史总结」
  summaries.value = res?.ok && Array.isArray(res.data) ? res.data : [];
}

function toggleTimeline() {
  tlExpanded.value = !tlExpanded.value;
  if (tlExpanded.value) loadSummaries();
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
    tlExpanded.value = false;
    refresh();
  },
  { immediate: true }
);
defineExpose({ refresh });

const progress = computed(() => s.value?.project?.progress ?? 0);
// 空项目：无任何任务（completed/pending 均来自任务树）
const isEmpty = computed(() => {
  if (!s.value) return false;
  return !s.value.completed?.length && !s.value.pending?.length;
});

function statusClass(st) {
  return { "待开始": "st-todo", "进行中": "st-doing", "已完成": "st-done", "已延期": "st-delay" }[st] || "st-todo";
}
</script>

<style scoped>
.overview-card {
  flex-shrink: 0;
  background: var(--bg-card);
  margin: 0 24px 24px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* ===== 头部 ===== */
.ov-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
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
.ov-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
}
.ov-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.st-todo { color: var(--status-todo-text); }
.st-doing { color: var(--status-doing-text); }
.st-done { color: var(--status-done-text); }
.st-delay { color: var(--status-delay-text); }
.ov-spacer { flex: 1; }
.ov-refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  font-family: inherit;
  padding: 4px 10px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.ov-refresh:hover {
  border-color: var(--border);
  color: var(--text);
  background: var(--bg);
}
.ov-refresh.spinning svg { animation: ov-spin 0.8s linear infinite; }
@keyframes ov-spin { to { transform: rotate(360deg); } }

/* ===== 内容 ===== */
.ov-body {
  padding: 4px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

/* 完成度 + 指标行 */
.ov-grid {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.ov-progress {
  flex: 1;
  min-width: 200px;
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
.ov-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-track {
  flex: 1;
  height: 5px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent-warm);
  transition: width 0.3s var(--ease-out);
}
.progress-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
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

/* 风险分级 */
.ov-risks {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ov-risk {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.ov-risk-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  align-self: center;
}
.risk-high .ov-risk-dot { background: var(--status-delay-text); }
.risk-medium .ov-risk-dot { background: var(--accent-warm); }
.risk-low .ov-risk-dot { background: var(--text-tertiary); }

/* 下一步 */
.ov-next {
  display: flex;
  flex-direction: column;
  gap: 5px;
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
  position: relative;
  padding-left: 14px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.ov-steps li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border);
}
.ov-steps-empty li { color: var(--text-tertiary); }

/* ===== 历史总结时间线（V2.0 S14）===== */
.ov-tl {
  border-top: 1px solid var(--border-light);
  padding-top: 8px;
  margin-top: 2px;
}
.ov-tl-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}
.ov-tl-title {
  font-size: 12px;
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
.ov-tl-body {
  padding: 6px 0 2px;
}
.ov-tl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  color: var(--accent-warm);
  background: var(--accent-warm-subtle);
}
.ov-tl-src.src-manual {
  color: var(--text-secondary);
  background: var(--bg-hover);
}
.ov-tl-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  word-break: break-word;
}
</style>
