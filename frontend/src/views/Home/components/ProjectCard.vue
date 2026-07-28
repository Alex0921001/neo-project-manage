<template>
  <div :class="['project-card', `status-${statusKey(displayStatus)}`]" @click="$emit('open', project.id)">
    <!-- 彩色侧边条按状态变色 -->
    <div class="card-accent"></div>

    <div class="card-content">
      <!-- header：色块图标 + 标题 + 状态 -->
      <div class="card-head">
        <div class="card-icon" :style="{ background: iconBg }">
          {{ (project.name || '?').slice(0, 1) }}
        </div>
        <div class="card-head-text">
          <div class="card-title">{{ project.name }}</div>
          <div class="card-sub">
            <span class="card-set">{{ setLabel }}</span>
            <span class="card-dot">·</span>
            <span :class="['card-status', statusClass(displayStatus)]">
              <span class="status-dot"></span>
              {{ displayStatus }}
            </span>
          </div>
        </div>
        <div class="card-menu" @click.stop>
          <button class="card-more" title="更多" @click="open = !open">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
          </button>
          <div :class="['card-dropdown', { open }]">
            <button @click="open = false; $emit('edit', project)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              编辑
            </button>
            <button class="dropdown-danger" @click="open = false; $emit('delete', project)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              删除
            </button>
          </div>
        </div>
      </div>

      <!-- 描述 -->
      <div class="card-desc">
        <span v-if="project.description">{{ project.description }}</span>
        <span v-else class="desc-empty">点击查看项目详情</span>
      </div>

      <!-- 进度条 -->
      <div class="card-progress">
        <div class="progress-meta">
          <span class="progress-label">任务进度</span>
          <span class="progress-count">{{ doneTaskCount || 0 }}/{{ project.taskCount || 0 }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>

      <!-- 底部信息条 -->
      <div class="card-footer">
        <div class="footer-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
          <span>{{ project.incompleteTaskCount || 0 }} 进行中</span>
        </div>
        <div class="footer-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>{{ project.fileCount || 0 }} 文件</span>
        </div>
        <div class="footer-stat footer-date">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
          <span>{{ project.planEnd || '∞' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { computeDisplayStatus } from "../../../utils/status.js";

const props = defineProps({
  project: { type: Object, required: true },
  setLabel: { type: String, default: "" },
});
defineEmits(["open", "edit", "delete"]);

const open = ref(false);

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

const iconBg = computed(() => {
  // 浅渐变色块
  const palettes = [
    "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
    "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
    "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
    "linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)",
    "linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%)",
    "linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)",
  ];
  let h = 0;
  const name = props.project.name || "";
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
});
</script>

<style scoped>
.project-card {
  position: relative;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.18s ease-out;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.project-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
  transform: translateY(-2px);
}

/* 左侧 4px 强调条按状态变色 */
.card-accent {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: #cbd5e1;
  transition: background 0.18s ease-out;
}
.status-doing .card-accent { background: #3b82f6; }
.status-done .card-accent { background: #10b981; }
.status-todo .card-accent { background: #94a3b8; }
.status-delay .card-accent { background: #ef4444; }

.card-content {
  padding: 16px 18px 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* header */
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  flex-shrink: 0;
  letter-spacing: -0.02em;
}
.card-head-text {
  flex: 1;
  min-width: 0;
}
.card-title {
  font-weight: 700;
  font-size: 15px;
  color: #111827;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.card-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
  flex-wrap: wrap;
}
.card-set { color: #6b7280; }
.card-dot { color: #d1d5db; }

.card-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
  flex-shrink: 0;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-todo { background: #f9fafb; color: #6b7280; border-color: #e5e7eb; }
.status-doing { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
.status-done { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.status-delay { background: #fef2f2; color: #991b1b; border-color: #fecaca; }

/* menu */
.card-menu { position: relative; flex-shrink: 0; }
.card-more {
  width: 26px; height: 26px;
  border: 1px solid transparent; border-radius: 6px;
  background: transparent; cursor: pointer;
  color: #9ca3af;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s ease-out;
}
.card-more:hover { background: #f3f4f6; color: #111827; border-color: #e5e7eb; }
.card-dropdown {
  display: none;
  position: absolute; top: 30px; right: 0;
  background: #ffffff; border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.10), 0 2px 6px rgba(0, 0, 0, 0.05);
  z-index: 100; min-width: 120px; padding: 4px;
  animation: dropIn 0.15s ease-out;
}
.card-dropdown.open { display: block; }
.card-dropdown button {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 8px 10px; border: none;
  background: none; cursor: pointer;
  font-size: 12px; text-align: left; color: #1f2937;
  border-radius: 6px;
  transition: background 0.12s ease-out;
}
.card-dropdown button:hover { background: #f3f4f6; }
.card-dropdown .dropdown-danger { color: #dc2626; }
.card-dropdown .dropdown-danger:hover { background: #fef2f2; }

/* description */
.card-desc {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.desc-empty { color: #9ca3af; font-style: italic; }

/* progress */
.card-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
}
.progress-label { color: #6b7280; letter-spacing: 0.02em; text-transform: uppercase; }
.progress-count { color: #1f2937; font-variant-numeric: tabular-nums; }
.progress-bar {
  width: 100%;
  height: 5px;
  background: #f3f4f6;
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #6366f1 100%);
  border-radius: 999px;
  transition: width 0.3s ease-out;
}
.status-done .progress-fill {
  background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
}
.status-todo .progress-fill {
  background: #cbd5e1;
}
.status-delay .progress-fill {
  background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
}

/* footer */
.card-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
  font-size: 11px;
  color: #6b7280;
}
.footer-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.footer-stat svg { opacity: 0.7; }
.footer-date {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: #4b5563;
  font-weight: 600;
}

@keyframes dropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
