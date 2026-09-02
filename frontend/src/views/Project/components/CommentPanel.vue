<template>
  <div v-show="show" ref="panelEl" class="cp-panel" :style="{ width: panelWidth + 'px' }">
    <!-- 左边缘拖拽柄：左右拖调宽（260~480），双击复位默认 300；宽度 localStorage 跨会话记忆 -->
    <div
      class="cp-resize"
      title="拖拽调整宽度，双击复位"
      @pointerdown="onResizeStart"
      @dblclick="resetWidth"
    ></div>
    <div class="cp-title">评论（{{ comments.length }}）</div>
    <div class="cp-list" ref="listEl">
      <div v-if="comments.length === 0" class="cp-empty">暂无评论</div>
      <div
        v-for="c in comments"
        :key="c.id"
        class="cp-item"
        :class="{ 'cp-flash': flashId === c.id }"
        :data-comment-id="c.id"
      >
        <template v-if="editingId === c.id">
          <textarea
            v-model="editDraft"
            class="cp-edit-box"
            rows="3"
            @keydown.enter="onEditKeydown"
            @keydown.esc.stop="cancelEdit"
          ></textarea>
          <div class="cp-edit-ops">
            <button class="cp-op" @click="cancelEdit">取消</button>
            <button class="cp-op cp-op-save" :disabled="!editDraft.trim() || saving" @click="saveEdit">保存</button>
          </div>
        </template>
        <template v-else>
          <div class="cp-meta">
            <span>{{ formatTime(c.createdAt) }}</span>
            <span v-if="c.edited" class="cp-edited">已编辑</span>
            <span class="cp-ops">
              <button class="cp-op" title="编辑" @click="startEdit(c)">编辑</button>
              <button class="cp-op cp-op-danger" title="删除" @click="askDelete(c)">删除</button>
            </span>
          </div>
          <!-- 引用块（划词引用）：琥珀左线 + 灰底，点击定位到正文引用处 -->
          <div v-if="c.quoteText" class="cp-quote" :title="c.quoteText" @click="locateQuote(c)">{{ c.quoteText }}</div>
          <div class="cp-body">{{ c.content }}</div>
        </template>
      </div>
    </div>
    <!-- 输入区：默认两行高，右下角手柄拖拽放大（长内容阅读），提交后复位；Esc 清空 -->
    <div class="cp-input-wrap">
      <textarea
        ref="inputEl"
        v-model="draft"
        class="cp-input"
        rows="2"
        placeholder="输入评论，回车发送（Shift + 回车换行）"
        @keydown="onInputKeydown"
      ></textarea>
      <div
        class="cp-input-resize"
        title="拖拽放大输入框"
        @pointerdown="onInputResizeStart"
      ></div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: String, required: true },
  targetType: { type: String, required: true }, // 'plan' | 'requirement'
  targetId: { type: String, required: true },
});
const emit = defineEmits(["loaded", "changed", "quoted", "locate-quote"]);

const comments = ref([]);
const draft = ref("");
const inputEl = ref(null);
const listEl = ref(null);
const panelEl = ref(null);
const editingId = ref("");
const editDraft = ref("");
const saving = ref(false);
const flashId = ref("");
const panelWidth = ref(loadWidth());

const WIDTH_KEY = "nvm-comment-panel-width";
const WIDTH_MIN = 260;
const WIDTH_MAX = 480;
const WIDTH_DEFAULT = 300;
const INPUT_HEIGHT_KEY = "nvm-comment-input-h";

function loadWidth() {
  const n = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isInteger(n) && n >= WIDTH_MIN && n <= WIDTH_MAX ? n : WIDTH_DEFAULT;
}
function saveWidth() {
  try { localStorage.setItem(WIDTH_KEY, String(panelWidth.value)); } catch {}
}

// ===== 分栏宽度拖拽 =====
let resizing = false;
function onResizeStart(e) {
  e.preventDefault();
  resizing = true;
  panelEl.value.setPointerCapture?.(e.pointerId);
  panelEl.value.dataset.dragging = "1";
  const move = (ev) => {
    if (!resizing) return;
    // 拖拽柄在面板左缘：鼠标左移 = 面板变宽
    const rect = panelEl.value.getBoundingClientRect();
    const next = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(rect.right - ev.clientX)));
    panelWidth.value = next;
  };
  const up = () => {
    resizing = false;
    delete panelEl.value.dataset.dragging;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    saveWidth();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function resetWidth() {
  panelWidth.value = WIDTH_DEFAULT;
  saveWidth();
}

// ===== 输入框高度拖拽放大（提交后复位） =====
let inputResizing = false;
function onInputResizeStart(e) {
  e.preventDefault();
  inputResizing = true;
  const el = inputEl.value;
  const startY = e.clientY;
  const startH = el.offsetHeight;
  const move = (ev) => {
    if (!inputResizing) return;
    const h = Math.min(320, Math.max(52, startH + (startY - ev.clientY)));
    el.style.height = h + "px";
  };
  const up = () => {
    inputResizing = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    try { localStorage.setItem(INPUT_HEIGHT_KEY, el.style.height); } catch {}
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
function resetInputHeight() {
  if (inputEl.value) inputEl.value.style.height = "";
  try { localStorage.removeItem(INPUT_HEIGHT_KEY); } catch {}
}

// ===== 数据 =====
let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  const res = await api(`api/projects/${props.projectId}/comments?targetType=${props.targetType}&targetId=${props.targetId}`);
  if (seq !== loadSeq) return; // 过期响应丢弃
  if (res?.ok) {
    comments.value = res.data || [];
    emit("loaded", comments.value.length);
  }
}

// 评论随对象切换重拉；输入中切对象丢弃前由父级确认（CommentPanel 只负责清态）
watch(() => [props.projectId, props.targetType, props.targetId], () => {
  comments.value = [];
  draft.value = "";
  cancelEdit();
  cancelQuote();
  resetInputHeight();
  if (props.targetId) load();
}, { immediate: true });

// IME 防护：输入法选词回车不当提交
function isComposingEvent(e) {
  return e.isComposing || e.keyCode === 229;
}

function onInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    if (isComposingEvent(e)) return;
    e.preventDefault();
    send();
  } else if (e.key === "Escape") {
    if (isComposingEvent(e)) return;
    draft.value = "";
    cancelQuote();
  }
}

async function send() {
  const content = draft.value.trim();
  if (!content) return;
  const body = { targetType: props.targetType, targetId: props.targetId, content };
  // 划词引用评论：附带引用文本与纯文本偏移锚（V2.6）
  if (pendingQuote.value) {
    body.quote = pendingQuote.value.text;
    body.quoteAnchor = JSON.stringify({ start: pendingQuote.value.start, end: pendingQuote.value.end });
  }
  saving.value = true;
  const res = await api(`api/projects/${props.projectId}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  saving.value = false;
  if (res?.ok) {
    // 乐观插入列表顶部（服务端排序新→旧）
    comments.value.unshift(res.data);
    draft.value = "";
    resetInputHeight();
    emit("loaded", comments.value.length);
    emit("changed");
    if (pendingQuote.value) {
      emit("quoted", { comment: res.data, anchor: pendingQuote.value });
      pendingQuote.value = null;
    }
    toast("已评论");
  } else {
    toast(res?.error || "评论失败", "error");
  }
}

// ===== 划词引用（父级选中文字后调 beginQuote，提交时携带锚，Esc 取消）=====
const pendingQuote = ref(null);
function beginQuote(anchor) {
  pendingQuote.value = anchor;
  inputEl.value?.focus();
}
function cancelQuote() {
  pendingQuote.value = null;
}
/** 点击评论引用块 → 通知父级定位正文高亮 */
function locateQuote(c) {
  emit("locate-quote", c);
}

function startEdit(c) {
  editingId.value = c.id;
  editDraft.value = c.content;
}
function cancelEdit() {
  editingId.value = "";
  editDraft.value = "";
}
function onEditKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    if (isComposingEvent(e)) return;
    e.preventDefault();
    saveEdit();
  }
}
async function saveEdit() {
  const content = editDraft.value.trim();
  if (!content) return;
  saving.value = true;
  const res = await api(`api/projects/${props.projectId}/comments/${editingId.value}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
  saving.value = false;
  if (res?.ok) {
    // 乐观更新本地条目
    const idx = comments.value.findIndex((c) => c.id === editingId.value);
    if (idx >= 0) comments.value[idx] = res.data;
    cancelEdit();
    emit("changed");
    toast("已更新评论");
  } else {
    toast(res?.error || "更新失败", "error");
  }
}

let askHandler = null;
/** 父级注入删除确认（复用各自弹窗的 ConfirmModal）：fn(comment) => Promise<boolean> */
function setConfirmHandler(fn) { askHandler = fn; }
async function askDelete(c) {
  if (askHandler) {
    const ok = await askHandler(c);
    if (!ok) return;
  }
  const res = await api(`api/projects/${props.projectId}/comments/${c.id}`, { method: "DELETE" });
  if (res?.ok) {
    comments.value = comments.value.filter((x) => x.id !== c.id);
    emit("loaded", comments.value.length);
    emit("changed");
    toast("已删除评论");
  } else {
    // 已被删（并发）：提示后本地移除
    comments.value = comments.value.filter((x) => x.id !== c.id);
    emit("loaded", comments.value.length);
    toast(res?.error || "已删除");
  }
}

/** 定位到某条评论并闪烁高亮（划词引用反向定位用） */
function scrollToComment(id) {
  flashId.value = "";
  requestAnimationFrame(() => {
    const el = listEl.value?.querySelector(`[data-comment-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    flashId.value = id;
    setTimeout(() => { flashId.value = ""; }, 1600);
  });
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

defineExpose({ load, scrollToComment, beginQuote, focusInput: () => inputEl.value?.focus(), setConfirmHandler, resetInputHeight });
</script>

<style scoped>
.cp-panel {
  flex: none;
  min-width: 0;
  padding-left: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  position: relative;
}
/* 左缘拖拽柄：贴边 4px 热区 */
.cp-resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 5;
}
.cp-resize:hover { background: var(--accent-light); }
.cp-panel[data-dragging="1"] { user-select: none; }
.cp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.cp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cp-empty {
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
  padding: 24px 0;
}
.cp-item {
  border-left: 2px solid var(--accent-warm);
  padding-left: 10px;
  border-radius: 0;
  transition: background var(--duration-fast) var(--ease-out);
}
/* 反向定位闪烁 */
.cp-flash { background: var(--accent-light); }
.cp-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.cp-edited { font-style: italic; }
.cp-ops {
  margin-left: auto;
  display: flex;
  gap: 4px;
  visibility: hidden;
}
.cp-item:hover .cp-ops { visibility: visible; }
.cp-op {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 4px;
}
.cp-op:hover { color: var(--text); background: var(--bg-hover); }
.cp-op-danger:hover { color: var(--status-delay-text); }
.cp-op-save { color: var(--accent); }
.cp-quote {
  font-size: 11.5px;
  color: var(--text-tertiary);
  background: var(--accent-warm-subtle);
  border-left: 2px solid var(--accent-warm);
  padding: 3px 6px;
  margin: 4px 0;
  border-radius: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.cp-body {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}
.cp-edit-box {
  width: 100%;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  font-size: 12.5px;
  padding: 6px 8px;
  background: var(--bg-card);
  color: var(--text);
  resize: vertical;
  min-height: 56px;
  outline: none;
}
.cp-edit-box:focus { border-color: var(--text); }
.cp-edit-ops {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}
.cp-input-wrap {
  flex-shrink: 0;
  position: relative;
}
.cp-input {
  width: 100%;
  box-sizing: border-box;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  font-size: 12.5px;
  padding: 7px 8px;
  background: var(--bg-card);
  color: var(--text);
  resize: none;
  min-height: 52px;
  max-height: 320px;
  outline: none;
  overflow-y: auto;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.cp-input:focus { border-color: var(--text); }
/* 输入框右下角放大手柄 */
.cp-input-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}
.cp-input-resize::after {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid var(--text-tertiary);
  border-bottom: 1.5px solid var(--text-tertiary);
  border-radius: 0;
}
.cp-input-resize:hover::after { border-color: var(--text); }
</style>
