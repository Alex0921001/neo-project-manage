<template>
  <div :class="['area-section', { 'mode-form': showAdd || editingId }]">
    <!-- Add mode -->
    <div v-if="showAdd" class="note-full-form">
      <header class="form-head">
        <span class="form-head-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </span>
        <h4 class="form-title">新建备注</h4>
        <button class="form-close" type="button" @click="showAdd = false" title="取消">✕</button>
      </header>
      <textarea
        v-model="addContent"
        rows="6"
        placeholder="随手记一条想法、链接、灵感……"
        class="form-textarea"
      ></textarea>
      <div class="form-foot">
        <span class="form-hint">字数 {{ addContent.length }} / 500</span>
        <div class="form-actions">
          <button class="btn-secondary" @click="showAdd = false">取消</button>
          <button class="btn-primary" :disabled="!addContent.trim()" @click="doAdd">添加备注</button>
        </div>
      </div>
    </div>

    <!-- Edit mode -->
    <div v-else-if="editingId" class="note-full-form">
      <header class="form-head">
        <span class="form-head-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </span>
        <h4 class="form-title">编辑备注</h4>
        <button class="form-close" type="button" @click="editingId = null" title="取消">✕</button>
      </header>
      <textarea
        v-model="editContent"
        rows="6"
        class="form-textarea"
      ></textarea>
      <div class="form-foot">
        <span class="form-hint">字数 {{ editContent.length }} / 500</span>
        <div class="form-actions">
          <button class="btn-secondary" @click="editingId = null">取消</button>
          <button class="btn-primary" :disabled="!editContent.trim()" @click="doEditNote">保存</button>
        </div>
      </div>
    </div>

    <!-- List mode -->
    <template v-else>
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

      <div v-else class="notes-list">
        <div
          v-for="(n, i) in notes.slice().reverse()"
          :key="n.id"
          class="note-card"
          :style="{ '--accent': palette[i % palette.length] }"
        >
          <span class="note-card-accent" aria-hidden="true"></span>
          <span class="note-card-quote" aria-hidden="true">❝</span>
          <p class="note-content" v-html="formatDescription(n.content)"></p>
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
    </template>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { formatDescription } from "../../../utils/text.js";

const props = defineProps({
  projectId: String,
  notes: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

const showAdd = ref(false);
const addContent = ref("");
const editingId = ref(null);
const editContent = ref("");

// 卡片左侧色条调色板（暖色为主，每张卡片循环）
const palette = [
  "oklch(0.72 0.13 75)",   // 暖橙
  "oklch(0.68 0.12 35)",   // 暖红
  "oklch(0.70 0.10 145)",  // 暖绿
  "oklch(0.65 0.12 270)",  // 紫
  "oklch(0.65 0.10 250)",  // 蓝
];

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

function startAdd() { showAdd.value = true; addContent.value = ""; }
async function doAdd() {
  if (!addContent.value.trim()) return toast("请输入备注内容", "error");
  const res = await api(`api/projects/${props.projectId}/notes`, {
    method: "POST", body: JSON.stringify({ content: addContent.value.trim() }),
  });
  if (res.ok) { toast("已添加"); showAdd.value = false; addContent.value = ""; load(); }
  else toast(res.error || "添加失败", "error");
}

function startEditNote(n) { editingId.value = n.id; editContent.value = n.content; }
async function doEditNote() {
  if (!editContent.value.trim()) return toast("备注内容不能为空", "error");
  const res = await api(`api/projects/${props.projectId}/notes/${editingId.value}`, {
    method: "PUT", body: JSON.stringify({ content: editContent.value.trim() }),
  });
  if (res.ok) { toast("已更新"); editingId.value = null; load(); }
  else toast(res.error || "更新失败", "error");
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
.area-section.mode-form {
  height: 100%;
  margin-bottom: 0;
}

/* ============ 顶部按钮区已删除：统一走父级 + 新建按钮 ============ */
.notes-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: linear-gradient(180deg, oklch(0.72 0.13 78), oklch(0.66 0.13 75));
  color: #fff;
  border: 1px solid oklch(0.60 0.13 73);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  transition: all 120ms var(--ease-out);
}
.notes-add:hover {
  background: linear-gradient(180deg, oklch(0.66 0.13 75), oklch(0.60 0.13 72));
  border-color: oklch(0.54 0.13 70);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
  transform: translateY(-0.5px);
}
.notes-add:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
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
  border: 1.5px dashed oklch(0.88 0.03 80);
  border-radius: 12px;
  background: linear-gradient(180deg, oklch(0.99 0.01 90), oklch(0.97 0.02 80));
  gap: 6px;
}
.notes-empty-deco {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: oklch(0.96 0.04 80);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: oklch(0.60 0.06 75);
  margin-bottom: 6px;
}
.notes-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: oklch(0.45 0.05 80);
}
.notes-empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.notes-add.notes-add-large {
  margin-top: 14px;
  padding: 8px 20px;
  font-size: 13px;
}

/* ============ 备注卡片 ============ */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-card {
  position: relative;
  background: linear-gradient(180deg, oklch(0.99 0.015 88) 0%, oklch(0.97 0.02 80) 100%);
  border: 1px solid oklch(0.90 0.04 80);
  border-left-width: 1px;
  border-radius: 8px;
  padding: 14px 16px 10px 22px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 2px 6px rgba(0, 0, 0, 0.04);
  transition:
    transform 200ms cubic-bezier(0.34, 1.4, 0.5, 1),
    box-shadow 200ms ease,
    border-color 200ms ease;
  overflow: hidden;
}
.note-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.06),
    0 10px 22px rgba(0, 0, 0, 0.07);
  border-color: oklch(0.85 0.06 75);
}

/* 左侧色条 */
.note-card-accent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: var(--accent, oklch(0.72 0.13 75));
  border-radius: 8px 0 0 8px;
}

/* 装饰引号 */
.note-card-quote {
  position: absolute;
  top: 6px;
  right: 12px;
  font-size: 32px;
  line-height: 1;
  color: var(--accent, oklch(0.72 0.13 75));
  opacity: 0.18;
  font-family: Georgia, "Times New Roman", serif;
  pointer-events: none;
  user-select: none;
}

.note-content {
  margin: 0 0 10px;
  font-size: 13.5px;
  line-height: 1.7;
  color: oklch(0.25 0.04 80);
  word-break: break-word;
  letter-spacing: 0.005em;
}

.note-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px dashed oklch(0.88 0.05 75);
}
.note-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: oklch(0.55 0.05 75);
  font-variant-numeric: tabular-nums;
}

.note-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transform: translateX(4px);
  transition: all 180ms var(--ease-out);
}
.note-card:hover .note-actions {
  opacity: 1;
  transform: translateX(0);
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
  color: oklch(0.55 0.05 75);
  transition: all 120ms var(--ease-out);
}
.note-action-edit:hover {
  background: oklch(0.94 0.06 80);
  color: oklch(0.40 0.13 75);
}
.note-action-del:hover {
  background: oklch(0.93 0.08 30);
  color: oklch(0.45 0.18 30);
}

/* ============ 内联表单（新建 / 编辑）============ */
.note-full-form {
  padding: 16px;
  border: 1px solid oklch(0.90 0.04 80);
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff, oklch(0.99 0.01 90));
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}
.form-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid oklch(0.92 0.03 80);
  flex-shrink: 0;
}
.form-head-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: oklch(0.95 0.04 80);
  color: oklch(0.45 0.10 75);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.form-title {
  margin: 0;
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.form-close {
  width: 24px;
  height: 24px;
  border: 1px solid oklch(0.88 0.05 80);
  background: oklch(0.98 0.02 90);
  color: oklch(0.55 0.05 75);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 120ms var(--ease-out);
}
.form-close:hover {
  background: oklch(0.95 0.05 30);
  color: oklch(0.45 0.15 30);
  border-color: oklch(0.65 0.12 30);
}

.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid oklch(0.88 0.04 80);
  border-radius: 8px;
  font-size: 13.5px;
  font-family: inherit;
  line-height: 1.65;
  resize: none;
  background: #fff;
  color: oklch(0.25 0.04 80);
  outline: none;
  flex: 1;
  min-height: 100px;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.form-textarea:focus {
  border-color: oklch(0.65 0.13 80);
  box-shadow: 0 0 0 3px oklch(0.65 0.13 80 / 0.1);
}

.form-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  gap: 8px;
  flex-shrink: 0;
}
.form-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.form-actions {
  display: flex;
  gap: 8px;
}
.btn-secondary,
.btn-primary {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 120ms var(--ease-out);
}
.btn-secondary {
  background: #fff;
  border-color: oklch(0.88 0.04 80);
  color: oklch(0.45 0.05 80);
}
.btn-secondary:hover {
  background: oklch(0.97 0.02 80);
  border-color: oklch(0.78 0.05 80);
}
.btn-primary {
  background: linear-gradient(180deg, oklch(0.72 0.13 78), oklch(0.66 0.13 75));
  color: #fff;
  border-color: oklch(0.60 0.13 73);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(180deg, oklch(0.66 0.13 75), oklch(0.60 0.13 72));
  border-color: oklch(0.54 0.13 70);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
  transform: translateY(-0.5px);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}
</style>
