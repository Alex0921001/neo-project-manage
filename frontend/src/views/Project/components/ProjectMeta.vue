<template>
  <div class="detail-meta">
    <!-- 头部：返回 + 标题 + 编辑 -->
    <div class="meta-head">
      <button class="btn-back" @click="$emit('back')" title="返回项目列表">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="meta-title" v-if="project?.name">{{ fullTitle }}</span>
      <span v-else class="meta-title meta-title-empty">未命名项目</span>
      <button class="icon-btn" v-if="project" title="复制 id: 名称" @click="copyProject">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="icon-btn" v-if="project" @click="$emit('edit')" title="编辑项目">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>

    <!-- 状态徽标 + 距离天数（高亮卡片）-->
    <div class="meta-headline">
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
      <div v-if="countdownText" :class="['meta-countdown', countdownClass]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>{{ countdownText }}</span>
      </div>
    </div>

    <!-- 字段卡片网格 -->
    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-card-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          计划周期
        </div>
        <div class="meta-card-value meta-card-date">
          <div>{{ project?.planStart || '—' }}</div>
          <div class="meta-card-date-sep">至</div>
          <div>{{ project?.planEnd || '—' }}</div>
        </div>
      </div>

      <div class="meta-card">
        <div class="meta-card-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          成员
        </div>
        <div class="meta-card-value">
          <div v-if="(project?.members || []).length" class="member-pills">
            <span
              v-for="m in project.members"
              :key="m"
              class="member-pill"
              :title="m"
            >
              <span class="member-pill-avatar" :style="{ background: avatarColor(m) }">{{ m.slice(0, 1) }}</span>
              <span class="member-pill-name">{{ m }}</span>
            </span>
          </div>
          <span v-else class="meta-empty">未指定</span>
        </div>
      </div>

      <div class="meta-card meta-card-wide">
        <div class="meta-card-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          描述
        </div>
        <div class="meta-card-value meta-desc">
          <div v-if="project?.description" class="meta-desc-body rich-view" v-html="formatDescription(project.description)" @click="onRichClick"></div>
          <span v-else class="meta-empty">暂无描述</span>
        </div>
      </div>
    </div>
    <teleport to="body">
      <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
    </teleport>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { computeDisplayStatus } from "../../../utils/status.js";
import { formatDescription } from "../../../utils/text.js";
import { useRichImagePreview } from "../../../utils/richImagePreview.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  project: Object,
  setLabel: { type: String, default: "" },
});
const emit = defineEmits(["edit", "back", "change-status"]);

const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const statusOptions = [
  { value: "待开始", label: "待开始" },
  { value: "进行中", label: "进行中" },
  { value: "已完成", label: "已完成" },
];

function pickStatus(v) {
  if (!props.project || v === props.project.status) return;
  emit("change-status", v);
}

const fullTitle = computed(() => {
  if (!props.project) return "";
  const name = props.project.name || "";
  if (props.setLabel) return `${props.setLabel} - ${name}`;
  return name;
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
    if (diff > 0) return { kind: "future", days: diff, text: `距离结束还有 ${diff} 天` };
    if (diff === 0) return { kind: "today", days: 0, text: `今天结束` };
    if (diff < 0) return { kind: "overdue", days: -diff, text: `已延期 ${-diff} 天` };
  }
  if (startStr) {
    const startDay = dayjs(startStr).startOf("day");
    const diff = startDay.diff(today, "day");
    if (diff > 0) return { kind: "future", days: diff, text: `距离开始还有 ${diff} 天` };
    if (diff === 0) return { kind: "today", days: 0, text: `今天开始` };
    if (diff < 0) return { kind: "started", days: -diff, text: `已开始 ${-diff} 天` };
  }
  return null;
});

const countdownText = computed(() => countdown.value?.text || "");
const countdownClass = computed(() => `countdown-${countdown.value?.kind || "neutral"}`);

// 成员头像颜色
const avatarPalette = [
  "oklch(0.62 0.10 240)",
  "oklch(0.62 0.10 180)",
  "oklch(0.62 0.10 280)",
  "oklch(0.62 0.10 320)",
  "oklch(0.62 0.08 60)",
  "oklch(0.58 0.10 200)",
  "oklch(0.58 0.08 145)",
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return avatarPalette[h % avatarPalette.length];
}
</script>

<style scoped>
.detail-meta {
  background: #ffffff;
  border-radius: var(--radius-lg);
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 18px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 360px;
  gap: 14px;
}

/* header */
.meta-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}
.meta-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #1f2937;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-title-empty { color: #9ca3af; font-weight: 500; }

.icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.btn-back {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  padding: 0;
}
.icon-btn:hover,
.btn-back:hover {
  background: #f3f4f6;
  color: #111827;
  border-color: #9ca3af;
}
.icon-btn svg,
.btn-back svg { display: block; }

/* 状态徽标 + 距离天数（高亮行）*/
.meta-headline {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}
.meta-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}
.chip-button {
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.02em;
  padding-right: 8px;
  transition: filter 120ms ease-out, transform 120ms ease-out;
}
.chip-button:hover:not(:disabled) {
  filter: brightness(0.96);
}
.chip-button:active:not(:disabled) {
  transform: translateY(1px);
}
.chip-button:disabled {
  cursor: default;
  opacity: 0.6;
}
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
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 3px currentColor;
}
.status-todo { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.status-doing { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
.status-done { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
.status-delay { background: #fee2e2; color: #991b1b; border-color: #fecaca; }

/* 状态下拉容器 */
.status-dropdown { position: relative; display: inline-flex; }

/* 距离天数 */
.meta-countdown {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  flex: 1;
  justify-content: center;
  min-width: 0;
}
.meta-countdown svg { display: block; flex-shrink: 0; }
.countdown-future { background: #ffffff; color: #374151; border-color: #d1d5db; }
.countdown-today { background: #f9fafb; color: #111827; border-color: #6b7280; font-weight: 700; }
.countdown-overdue { background: #f3f4f6; color: #111827; border-color: #1f2937; font-weight: 700; }
.countdown-started { background: #f9fafb; color: #4b5563; border-color: #e5e7eb; }
.countdown-done { background: #f9fafb; color: #4b5563; border-color: #e5e7eb; }

/* 字段卡片网格 */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.meta-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all var(--duration-fast) var(--ease-out);
}
.meta-card:hover {
  border-color: #9ca3af;
  background: #ffffff;
}
.meta-card-wide { grid-column: 1 / -1; }
.meta-card-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.meta-card-label svg { display: block; opacity: 0.7; }
.meta-card-value {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.45;
}
.meta-card-date {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.meta-card-date-sep { color: #9ca3af; font-size: 12px; }
.meta-desc {
  font-weight: 400;
  color: #4b5563;
  white-space: pre-wrap;
  word-break: break-word;
}
.meta-desc-body {
  font-weight: 400;
  color: #4b5563;
  word-break: break-word;
  line-height: 1.6;
}
.meta-empty { color: #9ca3af; font-weight: 400; font-style: italic; }

/* 成员 pill：头像 + 姓名，姓名能完整显示 */
.member-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.member-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px 0 2px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  max-width: 100%;
  font-size: 11px;
  color: #374151;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 0;
}
.member-pill-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0;
}
.member-pill-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
}
</style>

<style>
/* el-dropdown 内容 teleport 到 body，需全局样式（E） */
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
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 3px currentColor;
  flex-shrink: 0;
}
.status-dd-item .status-menu-label { line-height: 1.6; }
.status-dd-item .status-menu-check { margin-left: auto; }
</style>
