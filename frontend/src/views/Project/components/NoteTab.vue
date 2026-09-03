<template>
  <div class="area-section">
    <!-- 新建/编辑备注弹窗（公共 FormDialog：可拖拽/缩放/双击全屏） -->
    <FormDialog
      v-model:show="dialogShow"
      :title="editingId ? '编辑备注' : '新建备注'"
      :width="800"
      :height="560"
      :form="form"
      :rules="rules"
      :saving="saving"
      :save-text="editingId ? '保存' : '添加备注'"
      @update:show="(v) => { if (!v) dialogShow = false }"
      @cancel="dialogShow = false"
      @save="submit"
    >
      <el-form-item label="内容" prop="content" class="form-stretch">
        <RichEditor v-model="form.content" :project-id="projectId" placeholder="随手记一条想法、链接、灵感……" />
      </el-form-item>
    </FormDialog>

    <!-- 列表模式：搜索态显示内容匹配片段 + 关键词高亮 -->
    <div v-if="!notes.length" class="notes-empty">
      <div class="notes-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      </div>
      <p class="notes-empty-title">还没有备注</p>
      <p class="notes-empty-sub">随手记一条信息、链接或思路</p>
      <button class="notes-add notes-add-large" @click="startAdd">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>添加第一条备注</span>
      </button>
    </div>
    <div v-else-if="searchQuery && !filteredNotes.length" class="notes-empty">
      <div class="notes-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <p class="notes-empty-title">没有匹配的备注</p>
      <p class="notes-empty-sub">换个关键词或清空搜索框试试</p>
    </div>

    <div v-else class="notes-list">
      <div
        v-for="(n, i) in visibleNotes"
        :key="n.id"
        class="note-card"
        :style="{ '--accent': palette[i % palette.length] }"
      >
        <span class="note-card-accent" aria-hidden="true"></span>
        <span class="note-card-quote" aria-hidden="true">❝</span>
        <p v-if="searchQuery" class="note-content rich-view" v-html="highlightSnippet(n)"></p>
        <p v-else class="note-content rich-view" v-html="formatDescription(n.content)" @click="onRichClick"></p>
        <teleport to="body">
          <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
        </teleport>
        <div class="note-bottom">
          <span class="note-date">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {{ formatDate(n.createdAt) }}
          </span>
          <div class="note-actions">
            <button class="note-action note-action-edit" @click="startEditNote(n)" title="编辑">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="note-action note-action-del" @click="askDelete(n.id)" title="删除">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import FormDialog from "../../../components/FormDialog.vue";
import { formatDescription, normalizeRichText } from "../../../utils/text.js";
import { highlightKeyword } from "../../../utils/jump.js";
import { useRichImagePreview } from "../../../utils/richImagePreview.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";
// 富文本编辑器异步加载（含 loading/error/重试）
const RichEditor = createRichEditor();

const props = defineProps({
  projectId: String,
  notes: { type: Array, default: () => [] },
  searchQuery: { type: String, default: "" },
});
const emit = defineEmits(["changed", "confirm-ask"]);

const dialogShow = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = reactive({ content: "" });

const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const rules = {
  content: [{ required: true, message: "备注内容不能为空", trigger: "blur" }],
};

// 卡片左侧色条：统一标准便利贴黄（对齐 --sticky-bg 色相，加深一档 + 半透明保证可见又不厚重）
const palette = [
  "oklch(0.88 0.14 85 / 0.55)",
];

// ===== 备注内容搜索（V2.6.1）：剥 HTML 后匹配 + 命中片段高亮（先转义再包 <mark>，防 XSS） =====
const kw = computed(() => props.searchQuery.trim());
function plainOf(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}
const filteredNotes = computed(() => {
  const k = kw.value;
  if (!k) return props.notes.slice().reverse();
  return props.notes
    .slice()
    .reverse()
    .filter((n) => plainOf(n.content).toLowerCase().includes(k.toLowerCase()));
});
const visibleNotes = computed(() => (kw.value ? filteredNotes.value : props.notes.slice().reverse()));
function highlightSnippet(n) {
  const k = kw.value;
  const plain = plainOf(n.content);
  const idx = k ? plain.toLowerCase().indexOf(k.toLowerCase()) : -1;
  let snippet = plain;
  if (idx > 30) snippet = "…" + plain.slice(idx - 30);
  if (snippet.length > 140) snippet = snippet.slice(0, 140) + "…";
  return highlightKeyword(snippet, k);
}

function load() { emit("changed"); }

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, "0");
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startAdd() {
  editingId.value = null;
  form.content = "";
  dialogShow.value = true;
}

function startEditNote(n) {
  editingId.value = n.id;
  form.content = n.content;
  dialogShow.value = true;
}

async function submit() {
  const content = normalizeRichText(form.content);
  if (!content) {
    toast("备注内容不能为空", "error");
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      const res = await api(`api/projects/${props.projectId}/notes/${editingId.value}`, {
        method: "PUT", body: JSON.stringify({ content }), silent: true,
      });
      if (res.ok) { toast("已更新"); dialogShow.value = false; load(); }
      else toast(res.error || "更新失败", "error");
    } else {
      const res = await api(`api/projects/${props.projectId}/notes`, {
        method: "POST", body: JSON.stringify({ content }), silent: true,
      });
      if (res.ok) { toast("已添加"); dialogShow.value = false; load(); }
      else toast(res.error || "添加失败", "error");
    }
  } finally {
    saving.value = false;
  }
}

function askDelete(id) {
  emit("confirm-ask", { message: "确认删除此备注？", action: "delete-note", payload: id });
}

defineExpose({ openAdd: startAdd });
</script>

<style scoped>
.area-section {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ============ 顶部按钮区已删除：统一走父级 + 新建按钮 ============ */
.notes-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--text);
  color: var(--bg-card);
  border: 1px solid var(--text);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-fast) var(--ease-out);
}
.notes-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  box-shadow: var(--shadow-md);
}

/* ============ 空态 ============ */
.notes-empty {
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
.notes-empty-deco {
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
.notes-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}
.notes-empty-sub {
  margin: 0;
  font-size: 14px;
  color: var(--text-tertiary);
}
.notes-add.notes-add-large {
  margin-top: 14px;
  padding: 8px 20px;
  font-size: 15px;
}

/* ============ 备注卡片 ============ */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 14px 16px 10px 22px;
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--duration-normal) var(--ease-out),
    border-color var(--duration-normal) var(--ease-out);
  overflow: hidden;
}
.note-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border);
}

/* 左侧色条 */
.note-card-accent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: var(--accent, var(--accent-warm));
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

/* 装饰引号 */
.note-card-quote {
  position: absolute;
  top: 6px;
  right: 12px;
  font-size: 32px;
  line-height: 1;
  color: var(--accent, var(--accent-warm));
  opacity: 0.18;
  font-family: Georgia, "Times New Roman", serif;
  pointer-events: none;
  user-select: none;
}

.note-content {
  margin: 0 0 10px;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text);
  letter-spacing: 0.005em;
}

.note-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}
.note-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.note-actions {
  display: flex;
  gap: 2px;
}
.note-action {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
}
.note-action-edit:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}
.note-action-del:hover {
  background: var(--bg-hover);
  color: var(--danger);
}

.form-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
</style>
