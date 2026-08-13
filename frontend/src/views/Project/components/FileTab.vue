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

    <!-- 新建/重命名文件夹弹窗 -->
    <el-dialog
      v-model="folderDialog.show"
      :title="folderDialog.mode === 'rename' ? '重命名文件夹' : '新建文件夹'"
      width="400px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-position="top" @submit.prevent="folderDialogOk">
        <el-form-item :label="folderDialog.mode === 'rename' ? '新名称' : '文件夹名称'">
          <el-input
            v-model="folderDialog.name"
            placeholder="输入名称（同级内不能重名）"
            maxlength="50"
            @keyup.enter="folderDialogOk"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderDialog.show = false">取消</el-button>
        <el-button class="btn-save" @click="folderDialogOk">确定</el-button>
      </template>
    </el-dialog>

    <!-- 搜索框已移至 tab 栏「新建」左侧（index.vue 联动 setSearch） -->

    <!-- 主体：左树右网格 -->
    <div class="ft-body">
      <aside class="ft-sidebar">
        <div class="ft-tree">
          <!-- V2.1.4：去掉「全部文件」选项，默认根目录 -->
          <div
            class="ft-tree-fixed"
            :class="{ active: selectedFolder === 'root' }"
            @click="selectFolder('root')"
            @dragover.prevent
            @drop.prevent="moveDragFilesTo(null)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>根目录</span>
          </div>
          <FolderNode
            v-for="node in folders"
            :key="node.id"
            :node="node"
            :depth="0"
            :selected-id="selectedFolder === 'root' ? '' : selectedFolder"
            @select="selectFolder"
            @menu="openFolderMenu"
            @drop-file="moveDragFilesTo"
          />
          <div v-if="!folders.length" class="ft-tree-empty">暂无文件夹</div>
        </div>
      </aside>

      <div class="ft-main" @click.self="selected = []" @contextmenu.prevent="openRootMenu($event)">
        <div class="ft-view-head">
          <span v-if="selected.length" class="ft-selected-info">已选 {{ selected.length }} 项（Delete 删除）</span>
        </div>

        <div class="fg-grid">
          <div
            v-for="(f, idx) in visibleFiles"
            :key="f.id"
            class="fg-card"
            :class="{ selected: isSelected(f.id) }"
            draggable="true"
            :title="f.path || f.name"
            @click="onCardClick(f, idx, $event)"
            @dblclick="openFile(f)"
            @contextmenu.stop.prevent="openFileMenu(f, $event)"
            @dragstart="onDragStart(f)"
          >
            <div class="fg-icon" v-text="iconShort(f.name)"></div>
            <div class="fg-name" :title="f.name">{{ f.name }}</div>
            <div class="fg-meta">
              <span v-if="fileExt(f)" class="fg-ext">{{ fileExt(f) }}</span>
              <span v-if="f.size != null" class="fg-date">{{ formatSize(f.size) }}</span>
            </div>
            <div class="fg-foot">
              <span v-if="showFolderLabel && f.folderId" class="fg-folder" :title="folderNameOf(f.folderId)">{{ folderNameOf(f.folderId) }}</span>
              <span v-if="f.uploadedAt" class="fg-date">{{ f.uploadedAt }}</span>
            </div>
            <div v-if="f.pathExists === false" class="fg-missing" title="登记路径已失效，文件可能被移动或删除">路径失效</div>
            <span v-if="isSelected(f.id)" class="fg-check">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <button class="fg-del" title="删除登记" @click.stop="askDeleteFiles([f.id])">✕</button>
          </div>
        </div>
        <div v-if="!visibleFiles.length" class="files-empty">
          <div class="files-empty-deco">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
          </div>
          <p class="files-empty-title">{{ emptyTitle }}</p>
          <p class="files-empty-sub">{{ emptySub }}</p>
          <button v-if="!search" class="files-empty-add" @click="openAdd">登记文件</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单（文件夹 / 文件通用；folder=null 表示在空白处右键 → 根层新建文件夹） -->
    <div v-if="menu.show" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <template v-if="menu.type === 'folder'">
        <div v-if="!menu.folder" class="ctx-item" @click.stop="menuNewRoot">新建文件夹</div>
        <div v-if="menu.folder" class="ctx-item" @click.stop="menuNewChild">新建子文件夹</div>
        <div v-if="menu.folder" class="ctx-item" @click.stop="menuRename">重命名</div>
        <div v-if="menu.folder" class="ctx-item danger" @click.stop="menuDeleteFolder">删除</div>
      </template>
      <template v-else>
        <div class="ctx-item" @click.stop="menuOpenFile">打开</div>
        <div class="ctx-item" @click.stop="menuCopyPath">复制路径</div>
        <div class="ctx-item danger" @click.stop="menuDeleteFile">删除</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import FolderNode from "./FolderNode.vue";

const props = defineProps({
  projectId: String,
  files: { type: Array, default: () => [] },
  folders: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

// ===== 视图状态 =====
const search = ref("");
const selectedFolder = ref("root"); // 'root' 根目录 | folderId 具体文件夹（V2.1.4 去掉「全部文件」）
const selected = ref([]); // 选中的文件 id
const anchorIndex = ref(-1); // shift 连选锚点
const dragIds = ref([]); // 拖拽中的文件 id 集

// ===== 添加文件弹窗 =====
const dialogShow = ref(false);
const picking = ref(false);
const adding = ref(false);
const pending = ref([]);

// ===== 文件夹弹窗 =====
const folderDialog = ref({ show: false, mode: "create", parentId: "", id: "", name: "" });

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

const emptyTitle = computed(() => {
  if (search.value.trim()) return "未找到匹配文件";
  return "此目录暂无文件";
});
const emptySub = computed(() => {
  if (search.value.trim()) return "换个关键词试试，或清空搜索查看全部文件";
  return "可将文件拖拽到左侧文件夹中归类";
});

/** 当前视图下应显示的文件（搜索时全局匹配，忽略文件夹过滤） */
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
  return list;
});

/** 是否需要展示文件夹归属标签（仅搜索视图下显示） */
const showFolderLabel = computed(() => !!search.value.trim());

/** 登记文件的目标夹：当前选中的具体文件夹（root 时登记到根目录） */
const addTargetLabel = computed(() => {
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

// ===== 文件夹操作 =====
function selectFolder(id) {
  selectedFolder.value = id;
  selected.value = [];
  anchorIndex.value = -1;
}

function openNewRootFolder() {
  folderDialog.value = { show: true, mode: "create", parentId: "", id: "", name: "" };
}

/** 文件区空白右键：根层新建文件夹（folder=null） */
function openRootMenu(e) {
  if (menu.value.show) closeMenu();
  menu.value = {
    show: true, x: e.clientX, y: e.clientY, type: "folder",
    folder: null, file: null,
  };
}
function menuNewRoot() {
  closeMenu();
  openNewRootFolder();
}

function openFolderMenu({ folder, event }) {
  menu.value = {
    show: true, x: event.clientX, y: event.clientY, type: "folder",
    folder: { id: folder.id, name: folder.name }, file: null,
  };
}

function menuNewChild() {
  const f = menu.value.folder;
  closeMenu();
  folderDialog.value = { show: true, mode: "create", parentId: f.id, id: "", name: "" };
}

function menuRename() {
  const f = menu.value.folder;
  closeMenu();
  folderDialog.value = { show: true, mode: "rename", parentId: "", id: f.id, name: f.name };
}

function menuDeleteFolder() {
  const f = menu.value.folder;
  closeMenu();
  emit("confirm-ask", {
    message: `确认删除文件夹「${f.name}」？其下文件和子文件夹将提升到上级目录，不会删除任何文件。`,
    action: "delete-folder",
    payload: f.id,
    confirmText: "删除文件夹",
  });
}

async function folderDialogOk() {
  const d = folderDialog.value;
  const name = d.name.trim();
  if (!name) { toast("请输入文件夹名称", "error"); return; }
  if (d.mode === "create") {
    const res = await api(`api/projects/${props.projectId}/folders`, {
      method: "POST", body: JSON.stringify({ name, parentId: d.parentId || "" }), silent: true,
    });
    if (res?.ok) { toast(`已创建文件夹「${name}」`); folderDialog.value.show = false; emit("changed"); }
    else toast(res?.error || "创建失败", "error");
  } else {
    const res = await api(`api/projects/${props.projectId}/folders/${d.id}`, {
      method: "PUT", body: JSON.stringify({ name }), silent: true,
    });
    if (res?.ok) { toast("已重命名"); folderDialog.value.show = false; emit("changed"); }
    else toast(res?.error || "重命名失败", "error");
  }
}

// ===== 文件操作 =====
function fileName(p) {
  return p.split(/[\\/]/).pop() || p;
}

function openAdd() {
  pending.value = [];
  dialogShow.value = true;
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
  // 登记目标：当前选中具体文件夹时归入该夹，否则根目录
  const folderId = selectedFolder.value !== "all" && selectedFolder.value !== "root" ? selectedFolder.value : "";
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

function menuOpenFile() {
  const f = menu.value.file;
  closeMenu();
  if (f) openFile(f);
}

async function menuCopyPath() {
  const f = menu.value.file;
  closeMenu();
  if (!f?.path) { toast("无文件路径", "error"); return; }
  let ok = false;
  try {
    await navigator.clipboard.writeText(f.path);
    ok = true;
  } catch {
    // 剪贴板 API 受限时降级 execCommand
    const ta = document.createElement("textarea");
    ta.value = f.path;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand("copy");
    document.body.removeChild(ta);
  }
  toast(ok ? "路径已复制" : "复制失败", ok ? "success" : "error");
}

function menuDeleteFile() {
  const f = menu.value.file;
  closeMenu();
  if (f) askDeleteFiles([f.id]);
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
    toast(ok === ids.length ? `已移动 ${ok} 个文件` : `移动成功 ${ok}/${ids.length}`, ok === ids.length ? "success" : "warn");
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
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

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
/* 主体布局：左右等高，中间分割线（V2.1.4 去边框包裹） */
.ft-body { display: flex; align-items: stretch; }
.ft-sidebar {
  width: 200px; flex-shrink: 0;
  border-right: 1px solid var(--border-light);
  padding-right: 14px;
  overflow-y: auto;
}
.ft-tree { display: flex; flex-direction: column; gap: 1px; }
.ft-tree-fixed {
  display: flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; border-radius: var(--radius-sm);
  cursor: pointer; color: var(--text-secondary); font-size: 13px;
  user-select: none; white-space: nowrap;
  transition: background var(--duration-fast) var(--ease-out);
}
.ft-tree-fixed:hover { background: var(--bg-hover); color: var(--text); }
.ft-tree-fixed.active { background: var(--bg-hover); color: var(--text); font-weight: 600; }
.ft-tree-empty { padding: 10px 8px; font-size: 12px; color: var(--text-tertiary); }

/* 主区 */
.ft-main { flex: 1; min-width: 0; padding-left: 14px; }
.ft-view-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; min-height: 18px; }
.ft-selected-info { font-size: 12px; color: var(--accent); flex-shrink: 0; }

/* 文件网格 */
.fg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.fg-card {
  position: relative;
  display: flex; flex-direction: column; gap: 4px;
  padding: 14px 14px 10px;
  border: 1px solid var(--border-light); border-radius: var(--radius-md);
  background: var(--bg-card); cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.fg-card:hover { border-color: var(--border); }
.fg-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  background: var(--bg-hover);
}
.fg-icon {
  width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px; font-size: 11px; font-weight: 700; color: var(--text-secondary);
  background: var(--bg-hover); letter-spacing: 0.2px;
}
.fg-name {
  font-size: 13px; font-weight: 500; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fg-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
.fg-ext { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; }
.fg-foot { display: flex; align-items: center; gap: 8px; min-width: 0; }
.fg-folder {
  max-width: 90px; font-size: 12px; color: var(--accent);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fg-date { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; }
.fg-missing {
  position: absolute; top: 8px; right: 8px;
  font-size: 10px; line-height: 1; padding: 3px 6px;
  border-radius: var(--radius-sm);
  background: var(--danger); color: #fff;
  opacity: 0.9;
}
.fg-check {
  position: absolute; top: 8px; left: 8px;
  width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--accent); color: #fff;
}
.fg-del {
  position: absolute; top: 8px; right: 8px;
  width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent;
  cursor: pointer; font-size: 12px; line-height: 1; color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center; opacity: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.fg-card:hover .fg-del { opacity: 0.6; }
.fg-del:hover { opacity: 1 !important; background: var(--bg-hover); color: var(--danger); }
.fg-card .fg-missing + .fg-del { display: none; } /* 路径失效角标与删除按钮重叠时隐藏按钮 */

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

/* 空态 */
.files-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px 20px; text-align: center;
  color: var(--text-tertiary);
  border: 1px solid var(--border-light); border-radius: var(--radius-md);
  background: var(--bg-card); gap: 6px;
}
.files-empty-deco {
  width: 64px; height: 64px; border-radius: 50%;
  background: var(--bg-hover); display: inline-flex;
  align-items: center; justify-content: center;
  color: var(--text-tertiary); margin-bottom: 6px;
}
.files-empty-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.files-empty-sub { margin: 0; font-size: 12px; color: var(--text-tertiary); }
.files-empty-add {
  margin-top: 14px; padding: 8px 20px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--text); border-radius: var(--radius-md);
  background: var(--text); color: #fff; cursor: pointer; font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
  box-shadow: var(--shadow-sm);
}
.files-empty-add:hover { background: var(--accent-hover); border-color: var(--accent-hover); box-shadow: var(--shadow-md); }

.pick-hint { flex-basis: 100%; margin-top: 8px; font-size: 12px; color: var(--text-tertiary); }
.pending-list { display: flex; flex-direction: column; gap: 4px; width: 100%; max-height: 200px; overflow-y: auto; }
.pending-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--border-light); border-radius: 6px; background: var(--bg-card); }
.pending-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--text); }
.pending-del { width: 18px; height: 18px; border: none; background: transparent; color: var(--text-tertiary); font-size: 12px; line-height: 1; cursor: pointer; border-radius: 50%; flex-shrink: 0; transition: all 0.15s; }
.pending-del:hover { color: var(--danger); background: var(--bg-hover); }
.pending-empty { font-size: 12px; color: var(--text-tertiary); font-style: italic; }
</style>
