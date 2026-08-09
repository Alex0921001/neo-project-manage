<template>
  <div :class="['project-card', `status-${statusKey(displayStatus)}`]" @click="$emit('open', project.id)">
    <div class="card-content">
      <!-- 顶部：标题（一行截断）+ 状态 + 操作按钮（常显） -->
      <div class="card-head">
        <div class="card-title">{{ project.name }}</div>
        <span :class="['card-status', statusClass(displayStatus)]">
          <span class="status-dot"></span>
          {{ displayStatus }}
        </span>
        <div class="card-ops">
          <button class="card-op" title="复制 id: 名称" @click.stop="copyProject">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="card-op" title="编辑" @click.stop="$emit('edit', project)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="card-op card-op-danger" title="删除" @click.stop="$emit('delete', project)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <!-- 描述（两行截断） -->
      <div class="card-desc">
        <span v-if="project.description">{{ richTextToPlain(project.description) }}</span>
        <span v-else class="desc-empty">点击查看项目详情</span>
      </div>

      <!-- 日期行 -->
      <div class="card-date">
        <span class="date-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
          {{ project.planStart || '—' }}
        </span>
        <span class="date-sep">→</span>
        <span class="date-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
          {{ project.planEnd || '—' }}
        </span>
      </div>

      <!-- 统计行 -->
      <div class="card-stats">
        <span class="stat-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          {{ doneTaskCount || 0 }}/{{ project.taskCount || 0 }} 任务
        </span>
        <span class="stat-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          {{ project.fileCount || 0 }} 文件
        </span>
      </div>

      <!-- 底部：进度条 + 百分比 -->
      <div class="card-footer">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="progress-percent">{{ progressPercent }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { computeDisplayStatus } from "../../../utils/status.js";
import { richTextToPlain } from "../../../utils/text.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  project: { type: Object, required: true },
  setLabel: { type: String, default: "" },
});
defineEmits(["open", "edit", "delete"]);

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
  return { "待开始": "status-todo", "进行中": "status-doing", "已完成": "status-done", "已延期": "status-delay" }[s] || "status-todo";
}
function statusKey(s) {
  return ({ "待开始": "todo", "进行中": "doing", "已完成": "done", "已延期": "delay" })[s] || "todo";
}

const displayStatus = computed(() => computeDisplayStatus(props.project));

const doneTaskCount = computed(() => {
  return (props.project.taskCount || 0) - (props.project.incompleteTaskCount || 0);
});
const progressPercent = computed(() => {
  const total = props.project.taskCount || 0;
  if (total === 0) return 0;
  return Math.round((doneTaskCount.value / total) * 100);
});
</script>

<style scoped>
.project-card {
  position: relative;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
  box-shadow: var(--shadow-sm);
}
.project-card:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-md);
}

.card-content {
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* 顶部：标题 + 状态 + 操作按钮 */
.card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.card-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--text);
  letter-spacing: -0.01em;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  flex-shrink: 0;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-todo { color: var(--status-todo-text); }
.status-doing { color: var(--status-doing-text); }
.status-done { color: var(--status-done-text); }
.status-delay { color: var(--status-delay-text); }

.card-ops {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}
.card-op {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.card-op:hover { background: var(--bg-hover); color: var(--text); }
.card-op-danger:hover { background: #fdecec; color: #b00020; }

/* description */
.card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
}
.desc-empty { color: var(--text-tertiary); font-style: italic; }

/* 日期行 */
.card-date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.date-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.date-item svg { opacity: 0.55; }
.date-sep {
  color: var(--text-tertiary);
  font-size: 10px;
}

/* 统计行 */
.card-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 11px;
  color: var(--text-secondary);
}
.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.stat-item svg { opacity: 0.55; }

/* 底部：进度 + 百分比 */
.card-footer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-light);
}

.progress-bar {
  flex: 1;
  height: 3.5px;
  background: var(--bg-hover);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.3s var(--ease-out);
}
.status-doing .progress-fill { background: var(--status-doing-text); }
.status-todo .progress-fill { background: var(--status-todo-text); }
.status-done .progress-fill { background: var(--status-done-text); }
.status-delay .progress-fill { background: var(--status-delay-text); }

.progress-percent {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
