<template>
  <div :class="['detail-meta', statusClass(displayStatus)]">
    <!-- 头部：标题 + 状态 + 操作按钮 -->
    <div class="meta-head">
      <span class="meta-title" v-if="project?.name">{{ fullTitle }}</span>
      <span v-else class="meta-title meta-title-empty">未命名项目</span>
      <div class="meta-actions">
        <div class="status-dropdown" @click.stop>
          <el-dropdown trigger="click" :disabled="!project" @command="pickStatus">
            <button :class="['meta-status-chip', 'chip-button', statusClass(displayStatus)]" :disabled="!project">
              <span class="status-dot"></span>
              <span>{{ displayStatus || '待开始' }}</span>
              <svg class="chip-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="opt in statusOptions"
                  :key="opt.value"
                  :command="opt.value"
                  :class="['status-dd-item', statusClass(opt.value)]"
                >
                  <span class="status-dot"></span>
                  <span class="status-menu-label">{{ opt.label }}</span>
                  <svg v-if="opt.value === displayStatus" class="status-menu-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <button class="icon-btn" v-if="project" title="复制 id: 名称" @click="copyProject">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="icon-btn" v-if="project" title="编辑项目" @click="$emit('edit')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <!-- 归档：非进行中且未归档显示；已归档显示恢复（免确认） -->
        <button class="icon-btn" v-if="project && !project.archived && displayStatus !== '进行中'" title="归档项目" @click="$emit('archive')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
        </button>
        <button class="icon-btn" v-if="project && project.archived" title="恢复归档" @click="$emit('unarchive')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button class="icon-btn icon-btn-danger" v-if="project" title="删除项目" @click="$emit('delete')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>

    <!-- 描述（纯文本展示） -->
    <div v-if="descText" class="meta-desc">{{ descText }}</div>

    <!-- 元数据行：计划周期 / 剩余时间 / 成员 / 进度 -->
    <div class="meta-row">
      <div class="meta-item">
        <div class="meta-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          计划周期
        </div>
        <div class="meta-value meta-date">{{ project?.planStart || '—' }} → {{ project?.planEnd || '—' }}</div>
      </div>

      <div class="meta-item">
        <div class="meta-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          剩余时间
        </div>
        <div class="meta-value" :class="['meta-time', countdownClass]">{{ countdownText || '—' }}</div>
      </div>

      <div class="meta-item">
        <div class="meta-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          成员
        </div>
        <div class="meta-value meta-team">
          <template v-if="teamTags.length">
            <span v-for="m in teamTags" :key="m" class="team-tag">{{ m }}</span>
            <span v-if="teamMore > 0" class="team-more" :title="`${teamMore} 位成员`">+{{ teamMore }}</span>
          </template>
          <span v-else class="meta-empty">未指定</span>
        </div>
      </div>

      <div class="meta-item meta-item-progress">
        <div class="meta-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          进度
        </div>
        <div class="meta-value meta-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="progress-num">{{ progressPercent }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { computeDisplayStatus } from "../../../utils/status.js";
import { richTextToPlain } from "../../../utils/text.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  project: Object,
  setLabel: { type: String, default: "" },
});
const emit = defineEmits(["edit", "back", "delete", "change-status", "archive", "unarchive"]);

// ===== 描述（纯文本展示） =====
const descText = computed(() => richTextToPlain(props.project?.description || ""));

const statusOptions = [
  { value: "待开始", label: "待开始" },
  { value: "进行中", label: "进行中" },
  { value: "已完成", label: "已完成" },
  { value: "已取消", label: "已取消" },
];

function pickStatus(v) {
  if (!props.project || v === props.project.status) return;
  emit("change-status", v);
}

const fullTitle = computed(() => {
  if (!props.project) return "";
  return props.project.name || "";
});

// 复制到剪贴板（webview 内 Clipboard API 被 Permissions Policy 阻止，直接用 execCommand）
function copyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) toast("已复制");
    else toast("复制失败", "error");
  } catch (err) {
    toast("复制失败", "error");
  }
}

function copyProject() {
  if (!props.project) return;
  copyText(`使用项目管理插件工具搜索：【项目 id:${props.project.id}】 ${props.project.name || ""} 的具体内容。`);
}

function statusClass(s) {
  return {
    "待开始": "status-todo",
    "进行中": "status-doing",
    "已完成": "status-done",
    "已延期": "status-delay",
    "已取消": "status-cancel",
  }[s] || "status-todo";
}

const displayStatus = computed(() => computeDisplayStatus(props.project));

// 距离天数
import dayjs from "dayjs";

const countdown = computed(() => {
  // P3：today 不能是模块级常量（跨天不更新），每次计算时取当天
  const today = dayjs().startOf("day");
  if (!props.project) return null;
  const startStr = props.project.planStart;
  const endStr = props.project.planEnd;
  if (!startStr && !endStr) return null;

  const status = props.project.status;
  if (status === "已完成") {
    return { kind: "done", days: 0, text: "已完成" };
  }
  if (endStr) {
    const endDay = dayjs(endStr).startOf("day");
    const diff = endDay.diff(today, "day");
    if (diff > 0) return { kind: "future", days: diff, text: `剩余 ${diff} 天` };
    if (diff === 0) return { kind: "today", days: 0, text: `今天结束` };
    if (diff < 0) return { kind: "overdue", days: -diff, text: `已延期 ${-diff} 天` };
  }
  if (startStr) {
    const startDay = dayjs(startStr).startOf("day");
    const diff = startDay.diff(today, "day");
    if (diff > 0) return { kind: "future", days: diff, text: `距离开始 ${diff} 天` };
    if (diff === 0) return { kind: "today", days: 0, text: "今天开始" };
    if (diff < 0) return { kind: "started", days: -diff, text: `已开始 ${-diff} 天` };
  }
  return null;
});

const countdownText = computed(() => countdown.value?.text || "");
const countdownClass = computed(() => `countdown-${countdown.value?.kind || "neutral"}`);

// 成员 tag（前 3 个 + 溢出计数）
const teamTags = computed(() => (props.project?.members || []).slice(0, 3));
const teamMore = computed(() => Math.max(0, (props.project?.members || []).length - 3));

// 进度
const progressPercent = computed(() => {
  const total = props.project?.taskCount ?? 0;
  if (total <= 0) return 0;
  const done = total - (props.project?.incompleteTaskCount ?? 0);
  return Math.round((done / total) * 100);
});
</script>

<style scoped>
.detail-meta {
  padding: 0 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ===== 头部 ===== */
.meta-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.meta-title {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-title-empty { color: var(--text-tertiary); font-weight: 500; }

.meta-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.btn-back,
.icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border);
}
.icon-btn-danger:hover {
  background: #fdecec;
  color: #d33;
  border-color: #f3c1c1;
}
.icon-btn svg { display: block; }

/* 状态 chip（白底） */
.status-dropdown { position: relative; display: inline-flex; margin-right: 2px; }
.meta-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
}
.chip-button {
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.02em;
  padding-right: 8px;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.chip-button:hover:not(:disabled) { border-color: var(--border); }
.chip-button:active:not(:disabled) { opacity: 0.75; }
.chip-button:disabled { cursor: default; opacity: 0.6; }
.chip-caret {
  display: inline-block;
  margin-left: 2px;
  opacity: 0.7;
  transition: transform 160ms ease-out;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 3px currentColor;
}
.status-todo { color: var(--status-todo-text); }
.status-doing { color: var(--status-doing-text); }
.status-done { color: var(--status-done-text); }
.status-delay { color: var(--status-delay-text); }
.status-cancel { color: var(--status-cancel-text); }

/* ===== 描述（纯文本展示） ===== */
.meta-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ===== 元数据行 ===== */
.meta-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  border-top: 1px solid var(--border-light);
  padding-top: 12px;
}
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.meta-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.meta-label svg { display: block; opacity: 0.7; }
.meta-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-date { display: flex; align-items: center; gap: 6px; }
.meta-time { font-weight: 600; }
.countdown-future { color: var(--text); }
.countdown-today { color: var(--accent-warm); }
.countdown-overdue { color: var(--danger); }
.countdown-started { color: var(--text-secondary); }
.countdown-done { color: var(--status-done-text); }
.countdown-neutral { color: var(--text-tertiary); }

/* 成员 tag */
.meta-team {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.team-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.7;
  white-space: nowrap;
}
.team-more {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.meta-empty { color: var(--text-tertiary); font-weight: 400; font-style: italic; }

/* 进度 */
.meta-item-progress { min-width: 120px; }
.meta-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.progress-track {
  flex: 1;
  min-width: 0;
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
.status-todo .progress-fill { background: var(--status-todo-text); }
.status-doing .progress-fill { background: var(--status-doing-text); }
.status-done .progress-fill { background: var(--status-done-text); }
.status-delay .progress-fill { background: var(--status-delay-text); }
.status-cancel .progress-fill { background: var(--status-cancel-text); }
.progress-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}
</style>

<style>
/* el-dropdown 内容 teleport 到 body，需全局样式 */
.status-dd-item {
  display: flex !important;
  align-items: center;
  gap: 6px;
  min-width: 116px;
}
.status-dd-item .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 3px currentColor;
  flex-shrink: 0;
}
.status-dd-item .status-menu-label { line-height: 1.6; }
.status-dd-item .status-menu-check { margin-left: auto; }
</style>
