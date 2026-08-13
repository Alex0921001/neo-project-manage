<template>
  <div class="audit-area">
    <!-- 筛选栏：行为 + 时间范围（空态也显示，便于先筛选再查看） -->
    <div class="audit-filters">
      <el-select v-model="actionFilter" class="audit-filter-action" size="small" clearable placeholder="全部行为">
        <el-option v-for="a in actionOptions" :key="a" :label="a" :value="a" />
      </el-select>
      <input v-model="dateFrom" type="date" class="audit-filter-date" title="开始日期" />
      <span class="audit-filter-sep">至</span>
      <input v-model="dateTo" type="date" class="audit-filter-date" title="结束日期" />
      <button v-if="hasFilter" class="audit-filter-clear" @click="clearFilters">清空</button>
    </div>

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
            <span class="diff-old">
              {{ cutText(diffText(log).old, log.id + ':old') }}
              <button v-if="isLong(diffText(log).old)" class="diff-more" @click="toggleExpand(log.id, 'old')">{{ expanded.has(log.id + ':old') ? '收起' : '更多' }}</button>
            </span>
            <span v-if="diffText(log).old && diffText(log).next" class="diff-arrow">→</span>
            <span class="diff-new">
              {{ cutText(diffText(log).next, log.id + ':new') }}
              <button v-if="isLong(diffText(log).next)" class="diff-more" @click="toggleExpand(log.id, 'new')">{{ expanded.has(log.id + ':new') ? '收起' : '更多' }}</button>
            </span>
          </template>
          <span v-else class="diff-none">-</span>
        </span>
      </div>

      <!-- 分页 -->
      <div class="audit-foot">
        <span class="audit-count">共 {{ total }} 条</span>
        <div class="audit-pager">
          <button class="pager-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹ 上一页</button>
          <span class="pager-info">{{ page }} / {{ totalPages }}</span>
          <button class="pager-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页 ›</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";

const props = defineProps({
  projectId: String,
  project: { type: Object, default: null }, // 项目详情（用于目标名反查兜底）
});

const PAGE_SIZE = 10; // 每页 10 条
const logs = ref([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

// ===== 筛选状态：行为 + 时间范围 =====
const actionOptions = ref([]); // 行为下拉选项（后端返回项目全部行为去重）
const actionFilter = ref("");
const dateFrom = ref("");
const dateTo = ref("");
const hasFilter = computed(() => !!actionFilter.value || !!dateFrom.value || !!dateTo.value);
function clearFilters() {
  actionFilter.value = "";
  dateFrom.value = "";
  dateTo.value = "";
}
// 筛选变化 → 回到第 1 页重新查询
watch([actionFilter, dateFrom, dateTo], () => loadPage(1));

// ===== 字段名 / 值 翻译（英文数据结构 → 业务语言） =====
const FIELD_LABEL = {
  name: "名称",
  title: "标题",
  description: "描述",
  members: "成员",
  assignees: "成员",
  planStart: "开始日期",
  planEnd: "结束日期",
  startDate: "开始日期",
  endDate: "结束日期",
  // 任务 diff 键名为 DB 列名（snake_case）
  start_date: "开始日期",
  end_date: "结束日期",
  is_milestone: "里程碑",
  parent_task_id: "父任务",
  status: "状态",
  projectSetId: "项目集",
  archived: "归档",
  pinned: "收藏",
  priority: "优先级",
  isMilestone: "里程碑",
  done: "完成状态",
  content: "内容",
  kind: "类型",
  confirmed: "确认状态",
  parentTaskId: "父任务",
  fileRefs: "文件引用",
};
const VALUE_LABEL = {
  status: { 待开始: "待开始", 进行中: "进行中", 已完成: "已完成", 已取消: "已取消", 已延期: "已延期", 草稿: "草稿", 已采纳: "已采纳", 已废弃: "已废弃" },
  done: { 1: "完成", 0: "未完成", true: "完成", false: "未完成" },
  confirmed: { 1: "已确认", 0: "待确认", true: "已确认", false: "待确认" },
  kind: { note: "备注", decision: "决策", risk: "风险", milestone: "节点" },
  archived: { 1: "已归档", 0: "未归档", true: "已归档", false: "未归档" },
  pinned: { 1: "已收藏", 0: "未收藏", true: "已收藏", false: "未收藏" },
  isMilestone: { true: "是", false: "否" },
  is_milestone: { true: "是", false: "否" },
};

/** 变更内容翻译：JSON 对象 → 「中文名: 业务值」拼接；非 JSON 原样 */
function translateObj(raw) {
  if (!raw) return "";
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return fmtVal(raw);
  }
  if (obj === null || typeof obj !== "object") return fmtVal(obj);
  if (Array.isArray(obj)) return obj.length ? obj.join("、") : "空";
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    const label = FIELD_LABEL[k] || k;
    let val;
    if (Array.isArray(v)) val = v.length ? v.join("、") : "空";
    else if (VALUE_LABEL[k] && VALUE_LABEL[k][String(v)] !== undefined) val = VALUE_LABEL[k][String(v)];
    else if (typeof v === "object") val = JSON.stringify(v);
    else val = String(v);
    parts.push(`${label}: ${val}`);
  }
  return parts.join("，");
}

/** 变更内容截断 + 更多展开：内容过长（>60 字）默认折叠，点「更多」展开全部 */
const DIFF_CUT = 60;
const expanded = ref(new Set());
function isLong(text) {
  return String(text || "").length > DIFF_CUT;
}
function cutText(text, key) {
  const t = String(text || "");
  if (t.length <= DIFF_CUT || expanded.value.has(key)) return t;
  return `${t.slice(0, DIFF_CUT)}…`;
}
function toggleExpand(logId, side) {
  const key = `${logId}:${side}`;
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

// ===== 表格列处理 =====
const TYPE_LABEL = {
  project: "项目",
  task: "任务",
  annotation: "批注",
  file: "文件",
  note: "备注",
  member: "成员",
  project_set: "项目集",
  plan: "方案",
  plan_comment: "评论",
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

/** 变更内容：翻译后的 old → new 两侧展示 */
function diffText(log) {
  const oldT = translateObj(log.oldValue);
  const newT = translateObj(log.newValue);
  return { old: oldT, next: newT };
}

async function loadPage(p) {
  if (!props.projectId) return;
  loading.value = true;
  try {
    // 筛选参数：行为（精确）+ 时间范围（dateFrom / dateTo）
    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
    if (actionFilter.value) params.set("action", actionFilter.value);
    if (dateFrom.value) params.set("dateFrom", dateFrom.value);
    if (dateTo.value) params.set("dateTo", dateTo.value);
    const res = await api(`api/projects/${props.projectId}/audit-logs?${params}`, { silent: true });
    if (res?.ok) {
      logs.value = res.data.items || [];
      total.value = res.data.total || 0;
      // 行为下拉选项：取自后端返回的项目全部行为（去重）
      if (Array.isArray(res.data.actions)) actionOptions.value = res.data.actions;
      page.value = p;
    } else {
      logs.value = [];
      total.value = 0;
      page.value = 1;
    }
  } finally {
    loading.value = false;
  }
}

function goPage(p) {
  if (p < 1 || p > totalPages.value || p === page.value) return;
  loadPage(p);
}

watch(() => props.projectId, () => loadPage(1), { immediate: true });
defineExpose({ refresh: () => loadPage(1) });
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
/* 筛选栏：行为下拉 + 时间范围（date 输入） */
.audit-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 10px;
  flex-wrap: wrap;
}
.audit-filter-action {
  width: 150px;
}
.audit-filter-action :deep(.el-select__wrapper) {
  min-height: 30px;
}
.audit-filter-date {
  padding: 5px 8px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.audit-filter-date:focus {
  border-color: var(--border);
}
.audit-filter-sep {
  font-size: 12px;
  color: var(--text-tertiary);
}
.audit-filter-clear {
  padding: 4px 12px;
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
.audit-filter-clear:hover {
  border-color: var(--border);
  color: var(--text);
}
.audit-table {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.audit-head,
.audit-row {
  display: grid;
  grid-template-columns: 92px 110px 350px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
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
.col-target {
  color: var(--text-secondary);
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.col-diff {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}

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
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.diff-new {
  color: var(--text);
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.diff-more {
  border: none;
  background: none;
  color: var(--link);
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
  font-family: inherit;
  white-space: nowrap;
}
.diff-more:hover {
  text-decoration: underline;
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
  justify-content: space-between;
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
.audit-pager {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pager-btn {
  padding: 4px 14px;
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
.pager-btn:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}
.pager-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.pager-info {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
}
</style>
