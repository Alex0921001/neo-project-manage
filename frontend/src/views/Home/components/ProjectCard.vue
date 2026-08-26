<template>
  <div :class="['project-card', `status-${statusKey(displayStatus)}`]" @click="$emit('open', project.id)" @contextmenu.prevent="openMenu">
    <!-- 左装订边：虚线撕口 + 装订孔列 -->
    <div class="gutter gutter-left">
      <div class="tear"></div>
      <div class="hole-col">
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
      </div>
    </div>
    <!-- 右装订边 -->
    <div class="gutter gutter-right">
      <div class="tear"></div>
      <div class="hole-col">
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
        <div class="hole"></div>
      </div>
    </div>

    <!-- 便利贴胶带：状态色（已归档项目固定白色） -->
    <div :class="['tape', project.archived ? 'tape-archived' : `tape-${statusKey(displayStatus)}`]"></div>

    <!-- 头部：标题 + 收藏 + 编号 -->
    <div class="head">
      <div class="head-left">
        <button
          class="pin-btn"
          :class="{ 'pin-on': !!project.pinned }"
          :title="project.pinned ? '取消收藏' : '收藏置顶'"
          @click.stop="$emit('toggle-pin', project)"
        >
          <svg v-if="!project.pinned" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <div class="title" :title="project.name">{{ project.name }}</div>
      </div>
      <div class="no-chip">No.{{ project.id.slice(0, 6) }}</div>
    </div>

    <!-- 信息区：双栏字段 -->
    <div class="info">
      <div class="col">
        <div class="field">
          <div class="lab">日期</div>
          <div class="val mono">{{ fmtDate(project.planStart) }} ~ {{ fmtDate(project.planEnd) }}</div>
        </div>
        <div class="field">
          <div class="lab">项目集</div>
          <div class="val">{{ setLabel || '—' }}</div>
        </div>
      </div>
      <div class="col">
        <div class="field">
          <div class="lab">剩余</div>
          <div class="val mono">{{ remainingDays }}</div>
        </div>
        <div class="field">
          <div class="lab">进度</div>
          <div class="val mono">{{ progressPercent }}%</div>
        </div>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="divider"></div>

    <!-- 手写横格区：描述文字浮在连续横线上，每行文字下有下划线，下方延续手写横线 -->
    <div class="write-area">
      <div class="write-text">{{ descText || '这个用户很懒，还没有添加描述。' }}</div>
    </div>

    <!-- 底部说明 -->
    <div class="foot-desc">
      当前项目下拥有：任务（{{ doneTaskCount || 0 }}/{{ project.taskCount || 0 }}）需求（{{ project.reqCount || 0 }}）方案（{{ project.planCount || 0 }}）备注（{{ project.noteCount || 0 }}）文件（{{ project.fileCount || 0 }}）
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
  copyText(`使用项目管理插件工具搜索：【项目 id:${props.project.id}】 【${props.project.name || ""}】 的具体内容。`);
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

// ===== 剩余天数 =====
const remainingDays = computed(() => {
  if (!props.project.planEnd) return '—';
  const end = new Date(props.project.planEnd + 'T23:59:59');
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return '已过期';
  return diff + ' 天';
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
/* ===== 传真单（完全照搬参考结构） ===== */
.project-card {
  position: relative;
  height: 246px;
  background: #ffffff;
  border: 1px solid #e0d7c6;
  border-radius: 0;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02), 0 6px 18px rgba(90, 80, 70, 0.06);
  cursor: pointer;
  padding: 18px 30px 16px;
  display: flex;
  flex-direction: column;
  z-index: 0;
  transition: box-shadow var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
  will-change: transform;
}
.project-card:hover {
  transform: rotate(-2deg);
  box-shadow: 0 8px 24px rgba(90, 80, 70, 0.12);
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

/* 左右装订边：孔列靠外、撕口在孔列内侧，对齐参考比例 */
.gutter {
  position: absolute;
  top: 14px;
  bottom: 14px;
  width: 26px;
  pointer-events: none;
  z-index: 1;
}
.gutter.left { left: 5px; }
.gutter.right { right: 5px; }

/* 虚线撕口：位于孔列内侧边缘 */
.gutter .tear {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background-image: linear-gradient(to bottom, #d6ccb8 0, #d6ccb8 4px, transparent 4px, transparent 8px);
  background-size: 1px 8px;
  background-repeat: repeat-y;
}
.gutter.left .tear { left: 21px; }
.gutter.right .tear { right: 21px; }

/* 装订孔列 */
.gutter .hole-col {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.gutter.left .hole-col { left: 0; }
.gutter.right .hole-col { right: 0; }

/* 单个装订孔 */
.gutter .hole {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #f2ebdb;
  box-shadow: inset 0 0 0 1px #d6ccb8, inset 0 1px 3px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
}

/* 头部：标题 + 编号 */
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.title {
  font-family: 'EB Garamond', 'Noto Serif SC', 'Songti SC', 'STSong', serif;
  font-size: 15px;
  font-weight: 700;
  color: #5f574d;
  letter-spacing: 1px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.no-chip {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 10.5px;
  color: #7c7367;
  letter-spacing: 1px;
  line-height: 1.5;
}

/* 收藏星标 */
.pin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: #c3b9a8;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 0;
  border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.pin-btn svg { display: block; }
.pin-btn:hover { color: #f5a623; background: rgba(245, 166, 35, 0.12); }
.pin-btn.pin-on { color: #f5a623; }
.pin-btn.pin-on:hover { color: #c3b9a8; background: transparent; }

/* 信息区：双栏 */
.info {
  margin-top: 12px;
  display: flex;
  gap: 20px;
}
.info .col {
  flex: 1;
  min-width: 0;
}
.field {
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}
.field:last-child { margin-bottom: 0; }
.field .lab {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 9.5px;
  letter-spacing: 1px;
  color: #a8a094;
  flex-shrink: 0;
  width: 2.8em;
}
.field .val {
  font-size: 11px;
  color: #7c7367;
  min-width: 0;
  overflow: hidden;
  line-height: 1.5;
  word-break: break-word;
}
.field .val.mono {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  white-space: normal;
  word-break: break-word;
}

/* 分割线 */
.divider {
  margin-top: 10px;
  border-top: 1px dashed #c3b9a8;
}

/* 手写横格区：repeating-linear-gradient 画横线，文字每行下有一条线，下方空白延续横线 */
.write-area {
  margin-top: 6px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 21px,
    #e2d9c9 21px,
    #e2d9c9 22px
  );
}
.write-text {
  padding: 2px 0 0;
  font-size: 11px;
  line-height: 22px;
  color: #7c7367;
  font-family: 'EB Garamond', 'Noto Serif SC', serif;
  letter-spacing: 0.2px;
  word-break: break-word;
  white-space: normal;
}

/* 底部说明 */
.foot-desc {
  margin-top: 8px;
  font-size: 9.5px;
  color: #a8a094;
  letter-spacing: 0.2px;
  line-height: 1.6;
  font-family: 'EB Garamond', 'Noto Serif SC', serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
