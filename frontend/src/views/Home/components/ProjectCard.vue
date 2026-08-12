<template>
  <div :class="['project-card', `status-${statusKey(displayStatus)}`]" @click="$emit('open', project.id)" @contextmenu.prevent="openMenu">
    <!-- 便利贴胶带：状态色（已归档项目固定白色） -->
    <div :class="['tape', project.archived ? 'tape-archived' : `tape-${statusKey(displayStatus)}`]"></div>

    <div class="card-content">
      <!-- 第一行：收藏星标 + 项目名称 -->
      <div class="card-name-row">
        <button
          class="pin-btn"
          :class="{ 'pin-on': !!project.pinned }"
          :title="project.pinned ? '取消收藏' : '收藏置顶'"
          @click.stop="$emit('toggle-pin', project)"
        >
          <svg v-if="!project.pinned" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <div class="card-name" :title="project.name">{{ project.name }}</div>
      </div>

      <!-- 第二行：时间（小字灰色） -->
      <div class="card-date">
        <span>{{ fmtDate(project.planStart) }}</span>
        <span class="date-sep">→</span>
        <span>{{ fmtDate(project.planEnd) }}</span>
      </div>

      <!-- 第三行：进度条 -->
      <div class="card-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>

      <!-- 第四行：统计（任务 / 文件 / 备注） -->
      <div class="card-stats">
        <span class="stat-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/></svg>
          {{ doneTaskCount || 0 }}/{{ project.taskCount || 0 }}
        </span>
        <span class="stat-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          {{ project.fileCount || 0 }}
        </span>
        <span class="stat-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {{ project.noteCount || 0 }}
        </span>
      </div>

      <!-- 最后：描述（灰色短线线框，前100字） -->
      <div class="card-desc">
        <template v-if="descText">{{ descText }}</template>
        <span v-else class="desc-empty">这个用户很懒，还没有添加描述。</span>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="menuOpen" class="ctx-menu" @click.stop>
      <div class="ctx-item" @click="copyProject">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        复制 ID
      </div>
      <div class="ctx-item" @click="$emit('edit', project)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        编辑
      </div>
      <div class="ctx-item" v-if="canArchive" @click="$emit('archive', project)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
        归档
      </div>
      <div class="ctx-item" v-if="project.archived" @click="$emit('unarchive', project)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        取消归档
      </div>
      <div class="ctx-item ctx-danger" @click="$emit('delete', project)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        删除
      </div>
    </div>
  </div>
</template>

<script>
// 模块级状态：同一时间只允许一个卡片的右键菜单打开（右键第二张时自动关闭第一张）
let activeMenu = null;
</script>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { computeDisplayStatus } from "../../../utils/status.js";
import { richTextToPlain } from "../../../utils/text.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  project: { type: Object, required: true },
  setLabel: { type: String, default: "" },
});
defineEmits(["open", "edit", "delete", "archive", "unarchive", "toggle-pin"]);

// ===== 右键菜单 =====
const menuOpen = ref(false);
function openMenu() {
  if (activeMenu && activeMenu !== menuOpen) activeMenu.value = false;
  activeMenu = menuOpen;
  menuOpen.value = true;
}
function closeMenu() {
  menuOpen.value = false;
  if (activeMenu === menuOpen) activeMenu = null;
}
function onDocClick() {
  closeMenu();
}
function onKeydown(e) {
  if (e.key === "Escape") closeMenu();
}
function onScrollCapture() {
  closeMenu();
}
onMounted(() => {
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("scroll", onScrollCapture, true);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("scroll", onScrollCapture, true);
  if (activeMenu === menuOpen) activeMenu = null;
});

// ===== 复制 =====
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

// ===== 状态 =====
function statusKey(s) {
  return ({ "待开始": "todo", "进行中": "doing", "已完成": "done", "已延期": "delay", "已取消": "cancel" })[s] || "todo";
}
const displayStatus = computed(() => computeDisplayStatus(props.project));
// 归档入口：未归档且非进行中状态（已取消/待开始/已完成可归档；进行中与已归档不可）
const canArchive = computed(() => !props.project?.archived && displayStatus.value !== "进行中");

// ===== 统计 =====
const doneTaskCount = computed(() => {
  return (props.project.taskCount || 0) - (props.project.incompleteTaskCount || 0);
});
const progressPercent = computed(() => {
  const total = props.project.taskCount || 0;
  if (total === 0) return 0;
  return Math.round((doneTaskCount.value / total) * 100);
});

// ===== 描述（固定前 100 字） =====
const descText = computed(() => {
  const t = (props.project.description || "").trim();
  if (!t) return "";
  const plain = richTextToPlain(t);
  return plain.length > 100 ? plain.slice(0, 100) + "..." : plain;
});

// ===== 日期 =====
function fmtDate(d) {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : d;
}
</script>

<style scoped>
.project-card {
  position: relative;
  height: 262px;
  background: #fff;
  /* 无圆角 / 无边框，右下角硬阴影 + hover 旋转 */
  border: none;
  border-radius: 0;
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  padding: 22px 16px 14px;
  display: flex;
  flex-direction: column;
  z-index: 0;
  transition: box-shadow var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
  will-change: transform;
}
.project-card:hover {
  /* 顺时针轻微旋转 + 阴影加深 + 浮到上层 */
  transform: rotate(-2deg);
  box-shadow: 8px 8px 18px rgba(0, 0, 0, 0.15);
  z-index: 2;
}

/* 便利贴胶带：透明 + 锯齿撕口 */
.tape {
  position: absolute;
  top: -9px;
  left: 50%;
  width: 72px;
  height: 22px;
  transform: translateX(-50%) rotate(-3deg);
  opacity: 0.55;
  clip-path: polygon(
    0 6, 3 0, 6 6, 9 0, 12 6, 15 0, 18 6,
    18 0, 54 0,
    54 6, 57 0, 60 6, 63 0, 66 6, 69 0, 72 6,
    72 16, 69 22, 66 16, 63 22, 60 16, 57 22, 54 16,
    54 22, 18 22,
    18 16, 15 22, 12 16, 9 22, 6 16, 3 22, 0 16
  );
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.tape-todo { background: var(--status-todo-text); }
.tape-doing { background: var(--status-doing-text); }
.tape-done { background: var(--status-done-text); }
.tape-delay { background: var(--status-delay-text); }
.tape-cancel { background: var(--status-cancel-text); }
/* 已归档：白色胶带 + 内侧细黑边（inset 模拟边框，锯齿 clip-path 不裁掉） */
.tape-archived {
  background: var(--bg-card);
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.06), inset 0 0 0 1px oklch(0 0 0 / 0.22);
}

.card-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 第一行：收藏星标 + 名称 */
.card-name-row {
  position: relative; /* 星星绝对定位锚点 */
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 22px; /* 给星星让位（16px 按钮 + 6px gap） */
}
.pin-btn {
  position: absolute; /* 绝对定位：与 button 行高/文字基线彻底解耦 */
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  line-height: 0;
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.pin-btn svg {
  display: block;
  /* 星形 polygon 视觉重心偏上（viewBox y 2~21），下移 1px 与文字视觉中心对齐 */
  margin-top: 1px;
}
.pin-btn:hover {
  color: #f5a623;
  background: rgba(245, 166, 35, 0.12);
}
.pin-btn.pin-on {
  color: #f5a623;
}
.pin-btn.pin-on:hover {
  color: var(--text-tertiary);
}

/* 第一行：名称 */
.card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 2px;
  min-width: 0;
}

/* 第二行：时间 */
.card-date {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.date-sep {
  color: var(--text-tertiary);
  opacity: 0.6;
}

/* 第三行：进度条（颜色对齐胶带/状态色） */
.card-progress {
  margin-top: 14px;
}
.progress-bar {
  height: 4px;
  background: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent-warm);
  transition: width 0.3s var(--ease-out);
}
.status-todo .progress-fill { background: var(--status-todo-text); }
.status-doing .progress-fill { background: var(--status-doing-text); }
.status-done .progress-fill { background: var(--status-done-text); }
.status-delay .progress-fill { background: var(--status-delay-text); }
.status-cancel .progress-fill { background: var(--status-cancel-text); }

/* 第四行：统计 */
.card-stats {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 11.5px;
  color: var(--text-secondary);
}
.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.stat-item svg { opacity: 0.6; }

/* 描述：灰色短线（虚线）线框，前 100 字完整换行显示 */
.card-desc {
  margin-top: 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 7px 9px;
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.55;
  flex: 1;
  min-height: 0;
}
.desc-empty {
  color: var(--text-tertiary);
  font-style: italic;
}

/* 右键菜单 */
.ctx-menu {
  position: absolute;
  top: 18px;
  right: 10px;
  z-index: 10;
  min-width: 104px;
  padding: 4px;
  background: #fff;
  border: 0.5px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.ctx-item:hover { background: var(--bg-hover); }
.ctx-danger { color: #e5484d; }
.ctx-danger:hover { background: #fdecec; color: #d33; }
</style>
