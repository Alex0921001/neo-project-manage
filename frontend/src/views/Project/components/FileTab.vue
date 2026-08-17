<template>
  <div class="area-section" @click="closeMenu">
    <!-- 添加文件弹窗：桌面集成（选择本地文件路径） -->
    <el-dialog
      v-model="dialogShow"
      title="添加文件"
      width="480px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="选择本地文件">
          <el-button class="btn-save" :loading="picking" @click="pickFile">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            选择文件
          </el-button>
          <div class="pick-hint">登记到「{{ addTargetLabel }}」，支持任意类型，添加后可双击打开</div>
        </el-form-item>
        <el-form-item v-if="pending.length" label="已选择">
          <div class="pending-list">
            <div v-for="(p, i) in pending" :key="p + '_' + i" class="pending-item">
              <span class="pending-name" :title="p">{{ fileName(p) }}</span>
              <button class="pending-del" @click="pending.splice(i, 1)">✕</button>
            </div>
          </div>
        </el-form-item>
        <el-form-item v-else label="已选择">
          <span class="pending-empty">尚未选择文件</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogShow = false">取消</el-button>
        <el-button class="btn-save" :loading="adding" :disabled="!pending.length" @click="confirmAdd">
          添加 {{ pending.length ? `(${pending.length})` : '' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 搜索框已移至 tab 栏「新建」左侧（index.vue 联动 setSearch） -->

    <!-- 主体：左树右网格（分割线可拖，树宽 160~480 限制） -->
    <div class="ft-body">
      <aside class="ft-sidebar" :style="{ width: treeWidth + 'px' }">
        <div class="ft-tree" @dragover.prevent="onTreeDragOver" @dragleave="onTreeDragLeave" @drop.prevent="onRootDrop">
          <!-- 根目录：可展开/收起的顶层容器（展开显示根级文件夹，缩进在其下）；悬停 drop 显示琥珀高亮 -->
          <div
            class="ft-tree-fixed"
            :class="{ active: selectedFolder === 'root', 'drop-hover': rootDropHover }"
            @click="selectFolder('root')"
            @contextmenu.prevent="openRootMenu($event)"
            @dragover.prevent="onTreeDragOver"
            @dragleave="onTreeDragLeave"
            @drop.prevent.stop="onRootDrop"
          >
            <span class="ft-tree-arrow" :class="{ open: rootExpanded }" @click.stop="rootExpanded = !rootExpanded">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
            </span>
            <svg class="ft-tree-folder-ic" width="16" height="16" viewBox="0 0 24 24" fill="rgb(255,247,209)" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span class="ft-tree-name">根目录</span><span v-if="folderFileCounts.total" class="ft-tree-count">({{ folderFileCounts.total }})</span>
          </div>
          <template v-if="rootExpanded">
            <FolderNode
              v-for="node in folders"
              :key="node.id"
              :node="node"
              :depth="1"
              :selected-id="selectedFolder === 'root' ? '' : selectedFolder"
              :expanded-ids="expandedIds"
              :editing-id="editingFolder.id"
              :editing-value="editingFolder.name"
              :new-parent-id="newFolder.parentId"
              :new-value="newFolder.name"
              @drag-folder-id="dragFolderId"
              :file-counts="folderFileCounts"
              @drop-hover="rootDropHover = false"
              @select="selectFolder"
              @menu="openFolderMenu"
              @drop="onDropAt"
              @dragstart-folder="onFolderDragStart"
              @toggle="toggleFolder"
              @update:editing-value="editingFolder.name = $event"
              @commit-edit="commitEdit"
              @cancel-edit="cancelEdit"
              @update:new-value="newFolder.name = $event"
              @commit-new="commitNew"
              @cancel-new="cancelNew"
            />
            <!-- 根级新建输入行：对齐根级文件夹缩进（depth 1） -->
            <div v-if="newFolder.parentId === 'root'" class="ft-new-row" @click.stop>
              <span class="ft-new-pad"></span>
              <svg class="ft-tree-folder-ic" width="16" height="16" viewBox="0 0 24 24" fill="rgb(255,247,209)" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <input
                ref="rootNewInput"
                class="ft-edit-input"
                :value="newFolder.name"
                placeholder="新建文件夹"
                @input="newFolder.name = $event.target.value"
                @keyup.enter.stop="commitNew"
                @keyup.esc.stop="cancelNew"
                @blur="commitNew"
              />
            </div>
          </template>
        </div>
      </aside>

      <div
        class="ft-divider"
        @mousedown="startResize"
        @dblclick="treeWidth = 300"
      ></div>

      <div
        class="ft-main"
        :class="{ 'external-drop-hover': externalDropHover }"
        ref="gridContainerRef"
        @mousedown="onGridMouseDown"
        @click="onMainClick"
        @dragenter="onExternalDragEnter"
        @dragleave="onExternalDragLeave"
        @dragover="onExternalDragOver"
        @drop.prevent.stop="onExternalDrop"
      >
        <div class="fg-grid" ref="gridRef">
          <!-- Windows 风格卡片：图标 + 文件名；点击琥珀高亮；hover 三点信息；双击默认程序打开 -->
          <div
            v-for="(f, idx) in visibleFiles"
            :key="f.id"
            class="fg-card"
            :class="{ selected: isSelected(f.id) }"
            :data-id="f.id"
            draggable="true"
            @click="onCardClick(f, idx, $event)"
            @dblclick="openFile(f)"
            @contextmenu.stop.prevent="openFileMenu(f, $event)"
            @dragstart="onDragStart(f)"
            @mouseenter="showHover(f, $event)"
            @mouseleave="hideHover"
          >
            <img v-if="iconUrl(f)" class="fg-icon-img" :src="iconUrl(f)" alt="" draggable="false" />
            <span v-else class="fg-icon" v-text="iconShort(f.name)"></span>
            <div class="fg-name">{{ f.name }}</div>
            <div v-if="f.pathExists === false" class="fg-missing" title="登记路径已失效，文件可能被移动或删除">路径失效</div>
            <!-- 搜索态下展示文件夹归属 -->
            <div v-if="showFolderLabel && f.folderId" class="fg-folder" :title="folderNameOf(f.folderId)">{{ folderNameOf(f.folderId) }}</div>
          </div>
          <!-- 鼠标框选选区（absolute 于 ft-main 内，边界=整个右区可视区） -->
          <div v-if="marquee.show" class="fg-marquee" :style="marqueeStyle"></div>
        </div>
        <el-empty v-if="!visibleFiles.length" description="暂无文件" :image-size="90" />

        <!-- hover 气泡（fixed 跟随鼠标，脱离外层滚动裁剪；名称完整展示可折行，宽度受限） -->
        <div v-if="hover.show" class="fg-hover-tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
          <div class="fhi-row"><span class="fhi-label">名称</span><span class="fhi-val fhi-val-name">{{ hover.file?.name }}</span></div>
          <div class="fhi-row"><span class="fhi-label">类型</span><span class="fhi-val">{{ fileType(hover.file) }}</span></div>
          <div class="fhi-row"><span class="fhi-label">大小</span><span class="fhi-val">{{ formatSize(hover.file?.size) }}</span></div>
          <div class="fhi-row"><span class="fhi-label">登记时间</span><span class="fhi-val">{{ fmtTime(hover.file?.uploadedAt) }}</span></div>
        </div>
      </div>
    </div>

    <!-- 右键菜单（文件夹 / 文件通用；folder=null 表示在空白处右键 → 根层新建文件夹） -->
    <div v-if="menu.show" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <template v-if="menu.type === 'folder'">
        <div class="ctx-item" @click.stop="menuUpload">上传文件</div>
        <div v-if="!menu.folder" class="ctx-item" @click.stop="menuNewRoot">新建文件夹</div>
        <div v-if="menu.folder" class="ctx-item" @click.stop="menuNewChild">新建子文件夹</div>
        <div v-if="menu.folder" class="ctx-item" @click.stop="menuRename">编辑</div>
        <div v-if="menu.folder" class="ctx-item danger" @click.stop="menuDeleteFolder">删除</div>
      </template>
      <template v-else>
        <div class="ctx-item" @click.stop="menuOpenFile">打开</div>
        <div class="ctx-item" @click.stop="menuOpenFolder">打开文件夹</div>
        <div class="ctx-item" @click.stop="menuCopyPath">复制路径</div>
        <div class="ctx-item danger" @click.stop="menuDeleteFile">删除</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, toRefs } from "vue";
import { api, resolveAssetUrl } from "../../../api.js";
import { toast } from "../../../toast.js";
import { usePersistedTabState } from "../../../utils/usePersistedTabState.js";
import FolderNode from "./FolderNode.vue";

const props = defineProps({
  projectId: String,
  files: { type: Array, default: () => [] },
  folders: { type: Array, default: () => [] },
  sortMode: { type: String, default: "default" }, // V2.3.3 文件排序：default / name / type
});
const emit = defineEmits(["changed", "confirm-ask"]);

// ===== 视图状态 =====
const search = ref("");
// R13 文件 tab 树状态持久化：高亮文件夹 + 折叠集合（恢复后父链展开见 applyExpandState）
const folderState = usePersistedTabState(() => `${props.projectId}-files-tree`, {
  selectedFolder: "root",
  collapsedIds: [],
});
const { selectedFolder, collapsedIds } = toRefs(folderState);
/* 左侧空白视为根目录目标：悬停高亮根目录项（drop 后清除） */
const rootDropHover = ref(false);
function onTreeDragOver(e) {
  // 外部文件拖入左树：不支持登记（宿主 iframe 拿不到文件路径），静默无操作
  if (e.dataTransfer?.files?.length) { e.stopPropagation(); return; }
  rootDropHover.value = true;
  e.stopPropagation();
}
/** 离开根目录/左侧树时清高亮；子元素间移动（relatedTarget 仍在内部）不清，避免悬停闪烁 */
function onTreeDragLeave(e) {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
  rootDropHover.value = false;
}
function onRootDrop() {
  rootDropHover.value = false;
  onDropAt(""); // 左侧空白 / 根目录项 = 移动到根目录
}
/** 全局 dragend：无论拖到哪（文件夹/空白/自身/浏览器外部），结束都清理拖拽状态，避免禁用样式残留 */
function onGlobalDragEnd() {
  dragFolderId.value = "";
  dragIds.value = [];
  rootDropHover.value = false;
  externalDropDepth = 0;
  externalDropHover.value = false;
}
/* 左树宽度：默认 300，可拖 200~450，双击分割线复位；宽度全局持久化 */
const MIN_TREE = 200;
const MAX_TREE = 450;
const savedW = Number(localStorage.getItem("neo-pm-file-tree-width")) || 0;
const treeWidth = ref(savedW ? Math.min(MAX_TREE, Math.max(MIN_TREE, savedW)) : 300);
watch(treeWidth, (v) => localStorage.setItem("neo-pm-file-tree-width", String(v)));
let resizeStart = null;
function startResize(e) {
  if (e.button !== 0) return;
  e.preventDefault(); // 阻止文本选择等默认行为干扰拖拽
  resizeStart = { x: e.clientX, w: treeWidth.value };
  window.addEventListener("mousemove", onResize);
  window.addEventListener("mouseup", endResize);
  document.body.style.userSelect = "none";
}
function onResize(e) {
  if (!resizeStart) return;
  treeWidth.value = Math.min(MAX_TREE, Math.max(MIN_TREE, resizeStart.w + (e.clientX - resizeStart.x)));
}
function endResize() {
  if (!resizeStart) return;
  resizeStart = null;
  window.removeEventListener("mousemove", onResize);
  window.removeEventListener("mouseup", endResize);
  document.body.style.userSelect = "";
}
/** 文件夹 id → 直接文件数（只统计自己夹内文件，不含子孙夹）+ 根目录 = 未归类文件数 */
const folderFileCounts = computed(() => {
  const counts = {};
  for (const f of props.files || []) {
    if (f.folderId) counts[f.folderId] = (counts[f.folderId] || 0) + 1;
  }
  counts.total = (props.files || []).filter((f) => !f.folderId).length;
  return counts;
});
/* 文件夹数据加载完成后校验持久化的文件夹仍存在（被删则回根目录） */
watch(() => props.folders, (nodes) => {
  if (!nodes.length || selectedFolder.value === "root") return;
  const found = (() => {
    const walk = (list) => list.some((n) => n.id === selectedFolder.value || walk(n.children || []));
    return walk(nodes);
  })();
  if (!found) selectedFolder.value = "root";
});
const selected = ref([]); // 选中的文件 id
const anchorIndex = ref(-1); // shift 连选锚点
const dragIds = ref([]); // 拖拽中的文件 id 集

// ===== 添加文件弹窗 =====
const dialogShow = ref(false);
const picking = ref(false);
const adding = ref(false);
const pending = ref([]);
/** 右键上传的目标文件夹覆盖（null = 用当前选中文件夹）；每次打开弹窗时重设 */
const addFolderOverride = ref(null);

// ===== 右键菜单 =====
const menu = ref({ show: false, x: 0, y: 0, type: "file", folder: null, file: null });

// ===== 派生 =====
/** 文件夹 id → name 映射（树扁平化，用于归属显示） */
const folderMap = computed(() => {
  const map = new Map();
  const walk = (nodes) => {
    for (const n of nodes || []) {
      map.set(n.id, n.name);
      walk(n.children);
    }
  };
  walk(props.folders);
  return map;
});

function folderNameOf(id) {
  return folderMap.value.get(id) || "";
}

/** 当前视图下应显示的文件（搜索时全局匹配，忽略文件夹过滤）
 * 排序：default=后端原有顺序；name=名称排序；type=类型排序（同类型内按名称） */
const visibleFiles = computed(() => {
  let list = props.files;
  const kw = search.value.trim().toLowerCase();
  if (kw) {
    list = list.filter((f) => (f.name || "").toLowerCase().includes(kw));
  } else if (selectedFolder.value === "root") {
    list = list.filter((f) => !f.folderId);
  } else {
    list = list.filter((f) => f.folderId === selectedFolder.value);
  }
  const mode = props.sortMode || "default";
  if (mode === "name") {
    list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hans-CN", { numeric: true }));
  } else if (mode === "type") {
    list = [...list].sort((a, b) => {
      const ea = fileExt(a), eb = fileExt(b);
      if (ea !== eb) return ea.localeCompare(eb);
      return (a.name || "").localeCompare(b.name || "", "zh-Hans-CN", { numeric: true });
    });
  }
  return list;
});
/** 当前视图变化时清理选中：移出视图的文件自动从选中集移除（如拖拽转移/切换文件夹/删除后） */
watch(visibleFiles, (list) => {
  const ids = new Set(list.map((f) => f.id));
  selected.value = selected.value.filter((id) => ids.has(id));
});

/** 是否需要展示文件夹归属标签（仅搜索视图下显示） */
const showFolderLabel = computed(() => !!search.value.trim());

/** 登记文件的目标夹：右键上传时用覆盖目标，否则当前选中的具体文件夹（root 时登记到根目录） */
const addTargetLabel = computed(() => {
  if (addFolderOverride.value) {
    return `文件夹「${folderNameOf(addFolderOverride.value)}」`;
  }
  if (selectedFolder.value !== "root") {
    return `文件夹「${folderNameOf(selectedFolder.value)}」`;
  }
  return "根目录";
});

// ===== 选择逻辑（Ctrl 切换 / Shift 连选，基础多选） =====
function isSelected(id) {
  return selected.value.includes(id);
}

function onCardClick(f, idx, ev) {
  if (suppressClick) { suppressClick = false; return; } // 框选结束的 click 忽略
  if (ev.shiftKey && anchorIndex.value >= 0) {
    const a = Math.min(anchorIndex.value, idx);
    const b = Math.max(anchorIndex.value, idx);
    const ids = visibleFiles.value.slice(a, b + 1).map((x) => x.id);
    selected.value = [...new Set([...selected.value, ...ids])];
    return;
  }
  if (ev.ctrlKey || ev.metaKey) {
    selected.value = selected.value.includes(f.id)
      ? selected.value.filter((x) => x !== f.id)
      : [...selected.value, f.id];
    anchorIndex.value = idx;
    return;
  }
  selected.value = [f.id];
  anchorIndex.value = idx;
}

// ===== 鼠标框选（Windows 风格 marquee，右区容器相对坐标 + 实时碰撞检测）=====
const gridRef = ref(null);
const gridContainerRef = ref(null); // ft-main（整个右区可视区：框选边界与参考系）
const marquee = ref({ show: false, x1: 0, y1: 0, x2: 0, y2: 0 });
const marqueeActive = ref(false);
const marqueeCtrl = ref(false); // 本次框选是否追加模式（Ctrl/Cmd）
// hover 气泡（fixed 跟随鼠标，1000ms 延迟；位置由全局 mousemove 驱动，保证任意移动都跟随）
const hover = ref({ show: false, x: 0, y: 0, file: null });
let hoverTimer = null;
let hoverPos = { x: 0, y: 0 };
function showHover(f, e) {
  clearTimeout(hoverTimer);
  hoverPos = { x: e.clientX + 14, y: e.clientY + 14 };
  hover.value = { ...hover.value, show: false };
  hoverTimer = setTimeout(() => {
    hover.value = { show: true, x: hoverPos.x, y: hoverPos.y, file: f };
  }, 1000);
}
function onDocMouseMove(e) {
  hoverPos = { x: e.clientX + 14, y: e.clientY + 14 };
  if (hover.value.show) {
    hover.value.x = hoverPos.x;
    hover.value.y = hoverPos.y;
  }
}
function hideHover() {
  clearTimeout(hoverTimer);
  hover.value = { show: false, x: 0, y: 0, file: null };
}
/** hover 气泡：名称完整展示（不截断），气泡宽度受限，超长折行 */
const marqueeStyle = computed(() => {
  const m = marquee.value;
  if (!m.show) return {};
  // marquee 坐标已是容器相对（fg-grid），直接使用
  return {
    left: `${Math.min(m.x1, m.x2)}px`,
    top: `${Math.min(m.y1, m.y2)}px`,
    width: `${Math.abs(m.x2 - m.x1)}px`,
    height: `${Math.abs(m.y2 - m.y1)}px`,
  };
});
/** 鼠标位置转右区容器相对坐标：clamp 到 ft-main 边界内（标题区已无内容，上边界放开到右区顶部） */
function gridPoint(e) {
  const cont = gridContainerRef.value?.getBoundingClientRect();
  const w = cont?.width || 0;
  const h = cont?.height || 0;
  return {
    x: Math.max(0, Math.min(w, e.clientX - (cont?.left || 0))),
    y: Math.max(0, Math.min(h, e.clientY - (cont?.top || 0))),
  };
}
/** 取框选矩形（容器相对坐标） */
function getSelectionRect() {
  const m = marquee.value;
  return {
    left: Math.min(m.x1, m.x2),
    top: Math.min(m.y1, m.y2),
    right: Math.max(m.x1, m.x2),
    bottom: Math.max(m.y1, m.y2),
  };
}
/** 实时碰撞检测：矩形与卡片任意相交即选中（追加模式只增不减）；卡片相对右区容器同坐标系 */
function checkIntersection() {
  const box = getSelectionRect();
  const cont = gridContainerRef.value;
  if (!cont) return;
  const gr = cont.getBoundingClientRect();
  const hits = [];
  for (const card of cont.querySelectorAll(".fg-card")) {
    const cr = card.getBoundingClientRect();
    // 卡片矩形转换为容器相对坐标，与选框（容器相对）同坐标系
    const rel = {
      left: cr.left - gr.left,
      top: cr.top - gr.top,
      right: cr.right - gr.left,
      bottom: cr.bottom - gr.top,
    };
    // AABB 相交：只要任意一点在选框内即选中
    if (!(rel.right < box.left || rel.left > box.right || rel.bottom < box.top || rel.top > box.bottom)) {
      const id = card.dataset.id;
      if (id) hits.push(id);
    }
  }
  if (marqueeCtrl.value) {
    const cur = new Set(selected.value);
    for (const id of hits) cur.add(id);
    selected.value = [...cur];
  } else {
    selected.value = hits;
  }
}
/** 启动框选矩形（容器相对起点；ctrl=追加模式） */
function startMarquee(x1, y1, ctrl) {
  marqueeActive.value = true;
  marquee.value = { show: true, x1, y1, x2: x1, y2: y1 };
  marqueeCtrl.value = ctrl;
  if (!ctrl) { selected.value = []; anchorIndex.value = -1; }
}
function onGridMouseDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest?.(".fg-card")) return; // 文件上：点击/拖拽行为，不启动框选
  // 空白按下：立即启动框选（容器相对坐标）
  const p = gridPoint(e);
  startMarquee(p.x, p.y, !!(e.ctrlKey || e.metaKey));
}
function onGridMouseMove(e) {
  if (!marqueeActive.value) return;
  const p = gridPoint(e);
  marquee.value = { ...marquee.value, x2: p.x, y2: p.y };
  checkIntersection(); // 移动中实时碰撞检测，选中即时反馈
}
function onGridMouseUp(e) {
  if (!marqueeActive.value) return;
  marqueeActive.value = false;
  marquee.value = { ...marquee.value, show: false };
  anchorIndex.value = -1;
  suppressClick = true; // 框选结束：抑制随后的 click（避免单击逻辑覆盖框选结果）
}
/** 框选结束后 mouseup 落点触发的 click 抑制标志（新一轮 mousedown 时复位） */
let suppressClick = false;
/** 右区任意空白单击清空选中（卡片内点击交给 onCardClick；框选结束的 click 同样抑制） */
function onMainClick(e) {
  if (suppressClick) { suppressClick = false; return; }
  if (e.target.closest?.(".fg-card")) return; // 卡片上的点击不处理（点选逻辑在 onCardClick）
  selected.value = [];
}

/** Delete 键批量删除（input 聚焦时忽略） */
function onKeydown(ev) {
  if (ev.key !== "Delete") return;
  const t = ev.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (!selected.value.length) return;
  ev.preventDefault();
  askDeleteFiles([...selected.value]);
}

function askDeleteFiles(ids) {
  if (!ids.length) return;
  const n = ids.length;
  emit("confirm-ask", {
    message: `确认删除选中的 ${n} 个文件登记？仅移除登记引用，不影响磁盘文件。`,
    action: "delete-file",
    payload: n === 1 ? ids[0] : ids,
    confirmText: "删除",
  });
}

// ===== 文件夹选择 =====
function selectFolder(id) {
  selectedFolder.value = id;
  selected.value = [];
  anchorIndex.value = -1;
}

// ===== 文件夹行内编辑 / 新建（V2.1.4 精修：替代原弹窗，原处 input 编辑） =====
const rootExpanded = ref(true); // 根目录容器展开/收起
const expandedIds = ref(new Set()); // 展开的文件夹 id 集合（父级管理，初始全部展开）
const editingFolder = ref({ id: "", name: "" }); // 行内编辑中：仅 id 命中节点显示 input
const newFolder = ref({ parentId: "", name: "" }); // 新建输入行：parentId 为 "root"（根级）或具体文件夹 id
const rootNewInput = ref(null);
const dragFolderId = ref(""); // 拖拽中的文件夹 id（与文件拖拽 dragIds 区分）
// 外部文件拖入登记状态：悬停右区时琥珀遮罩提示（仅外部文件触发，内部拖拽不影响）
const externalDropHover = ref(false);
let externalDropDepth = 0; // dragenter/dragleave 嵌套计数（子元素进出防闪烁）

/** 重算展开集合：全部节点默认展开，剔除用户折叠的，再强制展开高亮文件夹的父链 */
function applyExpandState(nodes) {
  const s = new Set();
  const walk = (n2) => { for (const n of n2 || []) { s.add(n.id); walk(n.children); } };
  walk(nodes);
  for (const id of collapsedIds.value) s.delete(id);
  const chain = ancestorChain(nodes, selectedFolder.value);
  for (const id of chain) s.add(id);
  expandedIds.value = s;
}
/** 目标文件夹的祖先链（不含目标自身，root→父们），用于恢复高亮时展开父链 */
function ancestorChain(nodes, target) {
  if (!target || target === "root") return [];
  const chain = [];
  const find = (list, trail) => list.some((n) => {
    if (n.id === target) { chain.push(...trail); return true; }
    return find(n.children || [], [...trail, n.id]);
  });
  find(nodes, []);
  return chain;
}

function toggleFolder(id) {
  const s = new Set(expandedIds.value);
  if (s.has(id)) {
    s.delete(id);
    collapsedIds.value = [...new Set([...collapsedIds.value, id])];
  } else {
    s.add(id);
    collapsedIds.value = collapsedIds.value.filter((x) => x !== id);
  }
  expandedIds.value = s;
}

/** 同级文件夹名集合（父级下所有子夹名；parentId 空 = 根级） */
function siblingNames(parentId) {
  const names = new Set();
  const walk = (nodes) => {
    for (const n of nodes || []) {
      const pid = n.parentId || "";
      if (pid === (parentId || "")) names.add(n.name);
      walk(n.children);
    }
  };
  walk(props.folders);
  return names;
}

/** 新文件夹默认名：重名自动「新建文件夹（1）（2）…」 */
function defaultNewName(parentId) {
  const names = siblingNames(parentId);
  let base = "新建文件夹";
  if (!names.has(base)) return base;
  let i = 1;
  while (names.has(`${base}（${i}）`)) i++;
  return `${base}（${i}）`;
}

// —— 右键入口（弹窗改行内） ——
function menuNewRoot() {
  closeMenu();
  startNewRoot();
}
function menuNewChild() {
  const f = menu.value.folder;
  closeMenu();
  if (f) startNewChild(f.id);
}
function menuRename() {
  const f = menu.value.folder;
  closeMenu();
  if (f) startRename(f.id, f.name);
}

/** 行内新建：基于当前高亮（selectedFolder），根目录 → 根级，否则该文件夹下 */
function startNewRoot() {
  if (newFolder.value.parentId) return; // 已在新建中
  const parentId = selectedFolder.value === "root" ? "root" : selectedFolder.value;
  // 目标为具体文件夹时确保其展开（输入行在子级尾部）
  if (parentId !== "root") {
    const s = new Set(expandedIds.value);
    s.add(parentId);
    expandedIds.value = s;
  }
  newFolder.value = { parentId, name: defaultNewName(parentId) };
  cancelEdit();
  nextTick(() => {
    if (parentId === "root") rootNewInput.value?.focus();
  });
}
function startNewChild(parentId) {
  selectFolder(parentId);
  startNewRoot();
}

function startRename(id, name) {
  cancelNew();
  editingFolder.value = { id, name };
}

function cancelEdit() {
  editingFolder.value = { id: "", name: "" };
}
function cancelNew() {
  newFolder.value = { parentId: "", name: "" };
}

/** 行内编辑保存：同级重名检查（前端预检 + 后端兑底） */
async function commitEdit() {
  const { id, name } = editingFolder.value;
  if (!id) return;
  const val = name.trim();
  if (!val) { toast("名称不能为空", "error"); return; }
  // 查找该文件夹父级，检查同级重名（排除自身）
  let parentId = "";
  const findP = (nodes, target, parent) => {
    for (const n of nodes || []) {
      if (n.id === target) { parentId = n.parentId || ""; return true; }
      if (findP(n.children, target, n.id)) return true;
    }
    return false;
  };
  findP(props.folders, id, "");
  const names = siblingNames(parentId);
  names.delete(name); // 排除自身旧名
  if (names.has(val)) { toast(`同级已存在「${val}」，不能重名`, "error"); return; }
  cancelEdit();
  const res = await api(`api/projects/${props.projectId}/folders/${id}`, {
    method: "PUT", body: JSON.stringify({ name: val }), silent: true,
  });
  if (res?.ok) { emit("changed"); }
  else toast(res?.error || "保存失败", "error");
}

/** 行内新建保存：同级重名检查 */
async function commitNew() {
  const { parentId, name } = newFolder.value;
  if (!parentId) return;
  const val = name.trim();
  if (!val) { toast("名称不能为空", "error"); return; }
  const pid = parentId === "root" ? "" : parentId;
  if (siblingNames(pid).has(val)) { toast(`同级已存在「${val}」，不能重名`, "error"); return; }
  cancelNew();
  const res = await api(`api/projects/${props.projectId}/folders`, {
    method: "POST", body: JSON.stringify({ name: val, parentId: pid }), silent: true,
  });
  if (res?.ok) { emit("changed"); }
  else toast(res?.error || "创建失败", "error");
}

/** 文件区空白右键：根层新建文件夹（folder=null，仅显示「新建文件夹」） */
function openRootMenu(e) {
  if (menu.value.show) closeMenu();
  menu.value = {
    show: true, x: e.clientX, y: e.clientY, type: "folder",
    folder: null, file: null,
  };
}

function openFolderMenu({ folder, event }) {
  menu.value = {
    show: true, x: event.clientX, y: event.clientY, type: "folder",
    folder: { id: folder.id, name: folder.name }, file: null,
  };
}

// ===== 删除文件夹（真删除：文件夹 + 其下 n 个文件登记一起删；磁盘文件不动） =====
function menuDeleteFolder() {
  const f = menu.value.folder;
  closeMenu();
  if (!f) return;
  const n = countFolderFiles(f.id);
  emit("confirm-ask", {
    message: n > 0
      ? `是否删除文件夹「${f.name}」及下面的 ${n} 个文件？此操作不可恢复。`
      : `确认删除文件夹「${f.name}」？此操作不可恢复。`,
    action: "delete-folder",
    payload: f.id,
    confirmText: "删除",
  });
}

/** 递归统计文件夹内（含子孙夹）的文件登记数 */
function countFolderFiles(folderId) {
  const ids = [folderId];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.id === folderId) { collectFolderIds(n); break; }
      walk(n.children);
    }
  };
  const collectFolderIds = (n) => {
    for (const c of n.children || []) { ids.push(c.id); collectFolderIds(c); }
  };
  walk(props.folders);
  return props.files.filter((f) => f.folderId && ids.includes(f.folderId)).length;
}

// ===== 文件夹拖拽（只能拖到文件夹/根目录成为其子级；文件拖拽保留） =====
function onFolderDragStart(id) {
  dragFolderId.value = id;
  selected.value = [];
}

function onDropAt(payload) {
  // 兼容两种调用：FolderNode 传 { targetId } 对象；根目录固定项传 '' 字符串
  const targetId = typeof payload === "string" ? payload : (payload?.targetId ?? "");
  if (dragFolderId.value) {
    moveDragFolderTo(targetId);
  } else {
    moveDragFilesTo(targetId || null);
  }
}

async function moveDragFolderTo(targetId) {
  const id = dragFolderId.value;
  dragFolderId.value = "";
  if (!id) return;
  // 防御：入参强制字符串（历史 bug：FolderNode drop 曾传对象导致 SQL 绑定报错）
  const tid = String(targetId ?? "");
  if (id === tid) { toast("不能移动到自身", "error"); return; }
  // 防环：targetId 的祖先链若包含源 id（源是 target 的祖先），则源不能成为 target 的子级
  const chain = ancestorsOf(props.folders, tid);
  if (chain && chain.includes(id)) { toast("不能移动到自己的子文件夹中", "error"); return; }
  // 拖到当前父级 = 无意义操作，直接忽略（不发请求）
  const curParent = parentIdOf(props.folders, id);
  if (tid === (curParent || "")) return;
  const res = await api(`api/projects/${props.projectId}/folders/${id}`, {
    method: "PUT", body: JSON.stringify({ parentId: tid }), silent: true,
  });
  if (res?.ok) { emit("changed"); }
  else toast(res?.error || "移动失败", "error");
}

/** 递归找 targetId 的祖先链（含自身）；不在树中返回 null */
function ancestorsOf(nodes, targetId, chain = []) {
  for (const n of nodes || []) {
    if (n.id === targetId) return [...chain, n.id];
    const r = ancestorsOf(n.children, targetId, [...chain, n.id]);
    if (r) return r;
  }
  return null;
}

/** 递归找节点父级 id（根级返回 ""） */
function parentIdOf(nodes, id) {
  for (const n of nodes || []) {
    if (n.id === id) return n.parentId || "";
    const r = parentIdOf(n.children, id);
    if (r !== null) return r;
  }
  return null;
}

// ===== 文件操作 =====
function fileName(p) {
  return p.split(/[\\/]/).pop() || p;
}

function openAdd(folderId = null) {
  addFolderOverride.value = folderId;
  pending.value = [];
  dialogShow.value = true;
}

/** 右键「上传文件」：登记到被右键的文件夹（null = 根目录/当前选中） */
function menuUpload() {
  const fid = menu.value.folder?.id || null;
  closeMenu();
  openAdd(fid);
}

async function pickFile() {
  if (picking.value) return;
  picking.value = true;
  toast("正在打开系统文件选择窗口，请留意弹窗", "warn");
  let res = null;
  const warnTimer = setTimeout(() => {
    if (picking.value) toast("如果系统弹窗已打开，请完成选择；否则请重试", "warn");
  }, 12000);
  try {
    res = await api("api/pick-file", { silent: true });
  } catch (err) {
    res = { ok: false, error: err.message };
  } finally {
    clearTimeout(warnTimer);
    picking.value = false;
  }
  if (res?.ok && res.paths?.length > 0) {
    for (const p of res.paths) {
      if (p.trim() && !pending.value.includes(p)) pending.value.push(p);
    }
  } else {
    toast(res?.error || "未选择文件", "error");
  }
}

async function confirmAdd() {
  if (!pending.value.length) return;
  adding.value = true;
  // 登记目标：右键上传时用覆盖目标，否则当前选中具体文件夹，否则根目录
  const folderId = addFolderOverride.value || (selectedFolder.value !== "all" && selectedFolder.value !== "root" ? selectedFolder.value : "");
  const results = [];
  for (const p of pending.value) {
    const res = await api(`api/projects/${props.projectId}/files`, {
      method: "POST", body: JSON.stringify({ path: p, folderId }), silent: true,
    });
    results.push(res?.ok ? { ok: true, name: res.data?.name } : { ok: false, error: res?.error });
  }
  adding.value = false;
  const okCount = results.filter((r) => r.ok).length;
  if (okCount) {
    toast(okCount === results.length ? `已添加 ${okCount} 个文件` : `已添加 ${okCount}/${results.length} 个文件`, okCount === results.length ? "success" : "warn");
    dialogShow.value = false;
    pending.value = [];
    emit("changed");
  } else {
    toast(results[0]?.error || "添加失败", "error");
  }
}

async function openFile(f) {
  if (!f.path) { toast("无文件路径", "error"); return; }
  const res = await api(`api/open-file?path=${encodeURIComponent(f.path)}`, { silent: true });
  if (!res?.ok) toast(res?.error || "打开文件失败", "error");
}

// ===== 文件右键菜单 =====
function openFileMenu(f, event) {
  menu.value = {
    show: true, x: event.clientX, y: event.clientY, type: "file",
    folder: null, file: f,
  };
}

/** 批量动作目标：右键文件在选中集中且多选 → 全选中集；否则仅右键文件（对齐删除的 Windows 行为） */
function menuTargetFiles() {
  const f = menu.value.file;
  if (!f) return [];
  if (selected.value.includes(f.id) && selected.value.length > 1) {
    return selected.value.map((id) => props.files.find((x) => x.id === id)).filter(Boolean);
  }
  return [f];
}

function menuOpenFile() {
  const files = menuTargetFiles();
  closeMenu();
  for (const f of files) openFile(f); // 批量打开；openFile 内部失败 toast
}

/** 右键「打开文件夹」：资源管理器定位到文件所在文件夹（多选批量定位） */
async function menuOpenFolder() {
  const files = menuTargetFiles();
  closeMenu();
  for (const f of files) {
    if (!f?.path) { toast("无文件路径", "error"); continue; }
    const res = await api(`api/open-folder?path=${encodeURIComponent(f.path)}`, { silent: true });
    if (!res?.ok) toast(res?.error || "打开文件夹失败", "error");
  }
}

async function menuCopyPath() {
  const files = menuTargetFiles();
  closeMenu();
  const paths = files.map((f) => f.path).filter(Boolean);
  if (!paths.length) { toast("无文件路径", "error"); return; }
  const text = paths.join("\r\n");
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // 剪贴板 API 受限时降级 execCommand
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand("copy");
    document.body.removeChild(ta);
  }
  toast(ok ? `已复制 ${paths.length} 个路径` : "复制失败", ok ? "success" : "error");
}

function menuDeleteFile() {
  const f = menu.value.file;
  closeMenu();
  if (!f) return;
  // Windows 行为：右击选中集内的文件 → 批量删除整个选中集；否则单删
  if (selected.value.includes(f.id) && selected.value.length > 1) {
    askDeleteFiles([...selected.value]);
  } else {
    askDeleteFiles([f.id]);
  }
}

// ===== 外部文件拖入登记（桌面拖文件 → 按路径登记资产；内部拖拽优先走既有逻辑） =====
/** 外部文件进入右区：点亮琥珀提示（内部 HTML5 拖拽 dataTransfer 无 files，不触发） */
function onExternalDragEnter(e) {
  if (!e.dataTransfer?.files?.length) return;
  externalDropDepth += 1;
  externalDropHover.value = true;
}
/** 离开右区/移出窗口：计数归零熄灭；子元素间移动不清（relatedTarget 仍在内部） */
function onExternalDragLeave(e) {
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
  externalDropDepth = 0;
  externalDropHover.value = false;
}
/** 仅外部文件放行 drop（preventDefault 才允许松手落点）；内部拖拽保持浏览器默认（禁止光标，与现状一致） */
function onExternalDragOver(e) {
  if (e.dataTransfer?.files?.length) e.preventDefault();
}
/** 右区松手：内部拖拽（dragIds/dragFolderId）优先让位既有逻辑；外部文件批量登记 */
function onExternalDrop(e) {
  externalDropDepth = 0;
  externalDropHover.value = false;
  if (dragIds.value.length || dragFolderId.value) return; // 内部拖拽：既有逻辑（拖到文件夹/根目录）
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  registerDroppedFiles(files);
}
/** 批量登记拖入文件：目标 = 当前选中文件夹（root → null）
 * 注：宿主 iframe 拿不到拖入文件绝对路径（Electron 32+ 移除 File.path），此功能暂不可用，失败静默 */
async function registerDroppedFiles(files) {
  const list = [...files];
  const folderId = selectedFolder.value !== "root" ? selectedFolder.value : null;
  const results = await Promise.all(
    list.map((f) => api(`api/projects/${props.projectId}/files`, {
      method: "POST", body: JSON.stringify({ path: f?.path || "", folderId }), silent: true,
    }))
  );
  const okCount = results.filter((r) => r?.ok).length;
  if (okCount) emit("changed"); // 成功静默；失败也静默（拖入路径不可用，不打扰）
}

// ===== 拖拽移动 =====
function onDragStart(f) {
  dragIds.value = selected.value.includes(f.id) ? [...selected.value] : [f.id];
  anchorIndex.value = -1;
}

async function moveDragFilesTo(target) {
  const ids = dragIds.value;
  dragIds.value = [];
  if (!ids.length) return;
  const results = await Promise.all(
    ids.map((id) => api(`api/projects/${props.projectId}/files/${id}`, {
      method: "PUT", body: JSON.stringify({ folderId: target || "" }), silent: true,
    }))
  );
  const ok = results.filter((r) => r?.ok).length;
  if (ok) {
    // 移动成功静默（与文件夹操作一致：成功不提示，失败才提示）
    emit("changed");
  } else {
    toast("移动失败", "error");
  }
}

// ===== 右键菜单关闭 =====
function closeMenu() {
  menu.value.show = false;
}

// ===== 图标 / 格式化（沿用现有映射） =====
// 扩展名 → icons 目录图标文件（后端 /icons/:file 静态服务；未知扩展回退文字缩写）
const EXT_ICON = {
  docx: "DOCX", doc: "DOCX", xlsx: "XLSX", xls: "XLSX", pptx: "PPTX", ppt: "PPTX",
  pdf: "PDF", txt: "TXT", md: "MD", json: "JSON", js: "JS", css: "CSS",
  html: "HTML", htm: "HTML", xml: "XML", csv: "CSV", yaml: "YAML", yml: "YAML",
  toml: "TOML", sql: "SQL", sqlite: "SQLITE", db: "DB", zip: "ZIP", rar: "RAR",
  "7z": "a-7Z", jpg: "JPG", jpeg: "JPG", png: "PNG", gif: "GIF", svg: "SVG",
  webp: "WEBP", avif: "AVIF", tiff: "TIFF", raw: "RAW", bmp: "PNG",
  mp4: "MP4", mov: "MOV", avi: "AVI", mkv: "MKV", mp3: "MP3", wav: "WAV",
  flac: "FLAC", ogg: "OGG", epub: "EPUB", mobi: "MOBI", azw3: "AZW3",
  psd: "PSD", ai: "AI", fig: "FIG", sketch: "SKETCH", iso: "ISO", jar: "JAR",
  apk: "APK", ipa: "IPA", wasm: "WASM", srt: "SRT", vtt: "VTT", tex: "TEX",
  ipynb: "IPYNB", hdf5: "HDF5", parquet: "PARQUET", odt: "ODT", ods: "ODS",
  odp: "ODP", dwg: "DWG", dxf: "DXF", stl: "STL", step: "STEP", obj: "OBJ",
  fbx: "FBX", blend: "BLEND", dae: "DAE", glb: "GLB", cdr: "CDR", msi: "MSI",
  deb: "DEB", rpm: "RPM", appx: "APPX", cab: "CAB", chm: "CHM", djv: "DJVU",
  heic: "HEIC", indd: "INDD", ts: "JS", tsx: "JS", vue: "HTML",
};

function iconUrl(f) {
  const ext = (f.name || "").split(".").pop()?.toLowerCase();
  const icon = ext ? EXT_ICON[ext] : null;
  if (!icon) return "";
  return resolveAssetUrl(`/api/plugins/neo-project-manage/icons/${icon}.png`);
}

function fileType(f) {
  if (f.pathExists === false) return "路径失效";
  const ext = (f.name || "").split(".").pop()?.toLowerCase();
  if (!ext) return "未知类型";
  return `${ext.toUpperCase()} 文件`;
}

function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function iconShort(name) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  const map = { doc: "doc", docx: "doc", xls: "xls", xlsx: "xls", ppt: "ppt", pptx: "ppt", jpg: "img", jpeg: "img", png: "img", gif: "img", webp: "img", svg: "img", mp4: "vid", mov: "vid", avi: "vid", mkv: "vid", mp3: "aud", wav: "aud", flac: "aud", zip: "zip", rar: "rar", "7z": "7z", csv: "csv", js: "js", css: "css", html: "htm", xml: "xml", json: "jn", yaml: "yml", toml: "tml" };
  return map[ext] || ext?.toUpperCase() || "";
}

function formatSize(size) {
  if (size === null || size === undefined || Number.isNaN(Number(size))) return "";
  const n = Number(size);
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do { v /= 1024; i += 1; } while (v >= 1024 && i < units.length - 1);
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
  return `${s} ${units[i]}`;
}

function fileExt(f) {
  if (f?.ext) return String(f.ext).toLowerCase();
  const name = f?.name || "";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ext && ext !== name ? ext : "";
}

// ===== 生命周期 =====
// 初始展开所有文件夹（树首次渲染全展开）
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("mousemove", onGridMouseMove);
  document.addEventListener("mouseup", onGridMouseUp);
  document.addEventListener("mousemove", onDocMouseMove);
  window.addEventListener("dragend", onGlobalDragEnd);
  applyExpandState(props.folders);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("mousemove", onGridMouseMove);
  document.removeEventListener("mouseup", onGridMouseUp);
  document.removeEventListener("mousemove", onDocMouseMove);
  window.removeEventListener("dragend", onGlobalDragEnd);
  endResize();
});

// folders 数据更新后：重算展开集合（折叠集合持久化 + 高亮文件夹父链强制展开）
watch(() => props.folders, (nodes) => applyExpandState(nodes));

defineExpose({ openAdd, pickFile, setSearch });

/** tab 栏搜索框联动（index.vue watch fileSearch 调用） */
function setSearch(v) {
  search.value = v || "";
}
</script>

<style scoped>
.area-section { margin-bottom: 24px; }

/* 工具栏 */
.ft-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
/* 主体布局：左右等高填满剩余高度，中间分割线（V2.1.4 精修：左树独立滚动、不依赖右高） */
.ft-body {
  display: flex;
  align-items: stretch;
  height: calc(100vh - 340px);
  min-height: 360px;
}
.ft-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-light);
  padding-right: 14px;
  overflow: hidden;
  min-width: 0;
}
/* 分割线热区：无任何颜色与加粗，仅 hover 变鼠标指针（col-resize）；骑跨边框两侧便于抓取 */
.ft-divider {
  flex-shrink: 0;
  width: 12px;
  margin-left: -6px;
  cursor: col-resize;
  background: transparent;
}
.ft-tree { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; padding-right: 4px; }
.ft-tree-fixed {
  display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 8px; border-radius: var(--radius-sm);
  cursor: pointer; color: var(--text-secondary); font-size: 16px;
  user-select: none; white-space: nowrap;
  transition: background var(--duration-fast) var(--ease-out);
}
.ft-tree-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-tree-count { flex-shrink: 0; font-size: 12px; color: var(--text-tertiary); margin-left: 4px; font-variant-numeric: tabular-nums; }
.ft-tree-fixed.active .ft-tree-count { color: var(--text-tertiary); }
.ft-tree-fixed:hover { background: var(--bg-hover); color: var(--text); }
.ft-tree-fixed.active { background: var(--bg-hover); color: var(--text); font-weight: 600; }
.ft-tree-fixed.drop-hover { background: var(--accent-warm); color: #fff; } /* 放置到根目录悬停高亮；置于 active 之后保证优先（active+drop 同时存在时琥珀胜） */
.ft-tree-fixed > svg.ft-tree-folder-ic { color: var(--accent-warm); } /* 根目录实心文件夹图标：奶油填充 + 琥珀描边 */
.ft-tree-arrow {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.ft-tree-arrow svg { transition: transform var(--duration-fast) var(--ease-out); }
.ft-tree-arrow.open svg { transform: rotate(90deg); }
/* 根级新建输入行（对齐 FolderNode depth 1 缩进：22px 内边距 + 箭头占位） */
.ft-new-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding-left: 22px;
  padding-right: 8px;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  font-size: 13px;
  cursor: default;
}
.ft-new-pad { width: 12px; flex-shrink: 0; }
.ft-edit-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--accent-warm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--text);
  background: var(--bg-card);
  outline: none;
}

/* 主区 */
.ft-main { flex: 1; min-width: 0; padding-left: 14px; overflow-y: auto; min-height: 0; position: relative; /* 框选选区 absolute 参考系（整个右区可视区） */ }
/* 外部文件拖入悬停：琥珀遮罩 + 虚线边框 + 提示文案（inset 内收避开滚动条；pointer-events none 不干扰拖放） */
.ft-main.external-drop-hover::after {
  content: "释放以登记文件";
  position: absolute;
  inset: 6px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--accent-warm-hover);
  background: oklch(0.95 0.04 75 / 0.55);
  border: 2px dashed var(--accent-warm);
  border-radius: var(--radius-sm);
  pointer-events: none;
}

/* 文件网格（Windows 风格：图标 + 名称；选中淡琥珀底 + 琥珀直角虚线框；hover 浮层三点信息）
   列宽固定 112px（V2.3.3 调整：文件名两行展示，固定宽度保证折行稳定、不随容器伸缩变宽） */
.fg-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, 112px);
  gap: 8px;
  padding: 8px;
  user-select: none;
}
.fg-card {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 14px 8px 12px;
  border: 1px solid transparent;
  border-radius: 0; /* 直角卡片（与选中态虚线框一致，复古中式无圆角） */
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.fg-card:hover { background: var(--bg-hover); }
.fg-card.selected {
  background: var(--accent-warm-subtle);
  outline: 1px dashed var(--accent-warm);
  outline-offset: -1px;
}
.fg-icon-img { width: 44px; height: 44px; object-fit: contain; pointer-events: none; }
.fg-icon {
  width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: var(--text-secondary);
  letter-spacing: 0.2px; user-select: none;
}
/* 文件名：固定宽度 + 最多两行，超长截断省略；英文/数字也折行（break-all）
   两行高度下 gap/padding 已放大（gap 8px / 底部 12px）保证呼吸空间 */
.fg-name {
  width: 100%;
  max-width: 100%;
  font-size: 12px; font-weight: 500; color: var(--text);
  line-height: 1.4;
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}
.fg-card.selected .fg-name { color: var(--accent-warm-hover); font-weight: 600; }
/* hover 气泡（fixed 跟随鼠标，白底细边框，1000ms 延迟显示；名称完整展示可折行，宽度受限不随长名膨胀） */
.fg-hover-tip {
  position: fixed;
  z-index: 4000;
  min-width: 180px;
  max-width: 260px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  pointer-events: none;
  white-space: normal;
}
.fhi-row { display: flex; gap: 12px; align-items: flex-start; padding: 2px 0; }
.fhi-label { font-size: 11px; color: var(--text-tertiary); flex-shrink: 0; }
.fhi-val { font-size: 12px; color: var(--text); font-variant-numeric: tabular-nums; min-width: 0; }
/* 名称行：占满剩余宽度，长文件名在气泡 max-width 内折行（英文/数字 break-all），不受等宽数字样式影响 */
.fhi-val-name { flex: 1; font-variant-numeric: normal; word-break: break-all; }
.fg-folder {
  max-width: 90px; font-size: 12px; color: var(--accent);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fg-missing {
  position: absolute; top: 6px; right: 6px;
  font-size: 10px; line-height: 1; padding: 3px 6px;
  border-radius: var(--radius-sm);
  background: var(--danger); color: #fff;
  opacity: 0.9;
}
/* 鼠标框选选区（淡琥珀半透明 + 琥珀边框） */
.fg-marquee {
  position: absolute;
  z-index: 10;
  background: oklch(0.95 0.03 75 / 0.45);
  border: 1px solid var(--accent-warm);
  pointer-events: none;
}

/* 右键菜单 */
.ctx-menu {
  position: fixed; z-index: 3000;
  min-width: 130px; padding: 5px;
  background: var(--bg-card);
  border: 1px solid var(--border-light); border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}
.ctx-item {
  padding: 7px 12px; font-size: 13px; color: var(--text-secondary);
  border-radius: 4px; cursor: pointer; user-select: none;
  transition: background var(--duration-fast) var(--ease-out);
}
.ctx-item:hover { background: var(--bg-hover); color: var(--text); }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover { background: var(--danger); color: #fff; }

/* 空态（el-empty 纯文案） */


.pick-hint { flex-basis: 100%; margin-top: 8px; font-size: 12px; color: var(--text-tertiary); }
.pending-list { display: flex; flex-direction: column; gap: 4px; width: 100%; max-height: 200px; overflow-y: auto; }
.pending-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-card); }
.pending-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--text); }
.pending-del { width: 18px; height: 18px; border: none; background: transparent; color: var(--text-tertiary); font-size: 12px; line-height: 1; cursor: pointer; border-radius: 50%; flex-shrink: 0; transition: all 0.15s; }
.pending-del:hover { color: var(--danger); background: var(--bg-hover); }
.pending-empty { font-size: 12px; color: var(--text-tertiary); font-style: italic; }
</style>
