<template>
  <div class="audit-area">
    <!-- 空态 -->
    <div v-if="!loading && !logs.length" class="audit-empty">
      <div class="audit-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <p class="audit-empty-title">暂无审计记录</p>
      <p class="audit-empty-sub">项目的创建、编辑、删除等写操作会自动留痕</p>
    </div>

    <!-- 表格 -->
    <div v-else class="audit-table">
      <div class="audit-head">
        <span class="col-time">时间</span>
        <span class="col-action">行为</span>
        <span class="col-target">目标</span>
        <span class="col-diff">变更内容</span>
      </div>
      <div v-for="log in logs" :key="log.id" class="audit-row">
        <span class="col-time audit-time" :title="log.createdAt">{{ fmtTime(log.createdAt) }}</span>
        <span class="col-action">
          <span class="audit-action" :class="actionTone(log.action)">{{ log.action }}</span>
        </span>
        <span class="col-target audit-target">{{ targetLabel(log) }}</span>
        <span class="col-diff audit-diff">
          <template v-if="diffText(log)">
            <span class="diff-old">{{ diffText(log).old }}</span>
            <span v-if="diffText(log).old && diffText(log).next" class="diff-arrow">→</span>
            <span class="diff-new">{{ diffText(log).next }}</span>
          </template>
          <span v-else class="diff-none">-</span>
        </span>
      </div>

      <!-- 加载更多 -->
      <div class="audit-foot">
        <span class="audit-count">共 {{ total }} 条</span>
        <button v-if="hasMore" class="audit-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? "加载中…" : "加载更多" }}
        </button>
        <span v-else-if="logs.length" class="audit-end">已加载全部</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { api } from "../../../api.js";

const props = defineProps({
  projectId: String,
  project: { type: Object, default: null }, // 项目详情（用于目标名反查兜底）
});

const PAGE_SIZE = 20;
const logs = ref([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const offset = ref(0);

const hasMore = () => offset.value < total.value;

const TYPE_LABEL = {
  project: "项目",
  task: "任务",
  annotation: "批注",
  file: "文件",
  note: "备注",
  member: "成员",
  project_set: "项目集",
};

// 动作色系：删除类红色、归档类暖色、创建/更新类默认
function actionTone(action) {
  if (/删除/.test(action)) return "tone-del";
  if (/归档|恢复/.test(action)) return "tone-arch";
  return "";
}

/** ISO → MM-DD HH:mm（本地时区） */
function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 值展示：JSON 压缩 + 截断（默认 100 字符） */
function fmtVal(v, max = 100) {
  if (v === null || v === undefined) return "";
  let s;
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      if (j && typeof j === "object") s = JSON.stringify(j);
      else s = v;
    } catch {
      s = v;
    }
  } else {
    s = JSON.stringify(v);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 从 old/new JSON 提取目标名（name 优先，content 兜底） */
function extractName(log) {
  for (const raw of [log.newValue, log.oldValue]) {
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === "object") {
        if (j.name) return fmtVal(String(j.name), 18);
        if (j.content) return fmtVal(String(j.content), 18);
      }
    } catch { /* 非 JSON 跳过 */ }
  }
  return "";
}

/** 递归找任务树节点 */
function findTask(tasks, id) {
  for (const t of tasks || []) {
    if (t.id === id) return t;
    const hit = findTask(t.subtasks || [], id);
    if (hit) return hit;
  }
  return null;
}

/** 从项目详情反查目标名（变更字段不含 name 时的兜底，如只改状态） */
function lookupName(log) {
  const p = props.project;
  if (!p) return "";
  if (log.targetType === "project") return p.name || "";
  if (log.targetType === "task") return findTask(p.tasks, log.targetId)?.name || "";
  if (log.targetType === "annotation") {
    const stack = [...(p.tasks || [])];
    while (stack.length) {
      const t = stack.pop();
      const hit = (t.annotations || []).find((a) => a.id === log.targetId);
      if (hit) return fmtVal(String(hit.content), 18);
      stack.push(...(t.subtasks || []));
    }
    return "";
  }
  if (log.targetType === "file") return (p.files || []).find((f) => f.id === log.targetId)?.name || "";
  if (log.targetType === "note") return (p.notes || []).find((n) => n.id === log.targetId)?.content || "";
  return "";
}

function targetLabel(log) {
  const label = TYPE_LABEL[log.targetType] || log.targetType;
  const name = extractName(log) || lookupName(log);
  return name ? `${label}「${name}」` : `${label} ${log.targetId || ""}`;
}

/** 变更内容：old → new 两侧分别展示 */
function diffText(log) {
  const oldT = fmtVal(log.oldValue);
  const newT = fmtVal(log.newValue);
  return { old: oldT, next: newT };
}

async function load() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const res = await api(`api/projects/${props.projectId}/audit-logs?limit=${PAGE_SIZE}&offset=0`, { silent: true });
    if (res?.ok) {
      logs.value = res.data.items || [];
      total.value = res.data.total || 0;
      offset.value = PAGE_SIZE;
    } else {
      logs.value = [];
      total.value = 0;
      offset.value = 0;
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore()) return;
  loadingMore.value = true;
  try {
    const res = await api(`api/projects/${props.projectId}/audit-logs?limit=${PAGE_SIZE}&offset=${offset.value}`, { silent: true });
    if (res?.ok) {
      logs.value = logs.value.concat(res.data.items || []);
      total.value = res.data.total || 0;
      offset.value += PAGE_SIZE;
    }
  } finally {
    loadingMore.value = false;
  }
}

watch(() => props.projectId, load, { immediate: true });
defineExpose({ refresh: load });
</script>

<style scoped>
.audit-area {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ============ 空态 ============ */
.audit-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  gap: 6px;
}
.audit-empty-deco {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.audit-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.audit-empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ============ 表格 ============ */
.audit-table {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.audit-head,
.audit-row {
  display: grid;
  grid-template-columns: 92px 110px 150px 1fr;
  gap: 12px;
  align-items: center;
  padding: 9px 14px;
  font-size: 12.5px;
}
.audit-head {
  background: var(--bg-hover);
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  border-bottom: 1px solid var(--border-light);
}
.audit-row {
  border-bottom: 1px solid var(--border-light);
  transition: background var(--duration-fast) var(--ease-out);
}
.audit-row:last-child {
  border-bottom: none;
}
.audit-row:hover {
  background: var(--bg-hover);
}
.col-time { color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.col-action { white-space: nowrap; }
.col-target { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-diff { min-width: 0; }

.audit-action {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11.5px;
}
.audit-action.tone-del {
  background: oklch(0.93 0.03 20 / 0.5);
  color: var(--danger, #d9534f);
}
.audit-action.tone-arch {
  background: oklch(0.94 0.05 80 / 0.5);
  color: var(--accent-warm, #b8860b);
}

.audit-diff {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.diff-old {
  color: var(--text-tertiary);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklab, var(--text-tertiary) 55%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}
.diff-new {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}
.diff-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.diff-none {
  color: var(--text-tertiary);
}

/* ============ 底部 ============ */
.audit-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}
.audit-count {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.audit-more {
  padding: 5px 18px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
}
.audit-more:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}
.audit-more:disabled {
  opacity: 0.6;
  cursor: default;
}
.audit-end {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
