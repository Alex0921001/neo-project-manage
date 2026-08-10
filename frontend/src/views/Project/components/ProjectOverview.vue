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

watch(() => props.projectId, refresh, { immediate: true });
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
</style>
