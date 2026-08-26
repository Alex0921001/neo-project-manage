<template>
  <div class="rich-editor" :class="{ focused: focused }">
    <div class="rich-toolbar">
      <!-- 文本：加粗 / 斜体 / 下划线 / 删除线 -->
      <el-tooltip content="加粗" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('bold') }" @mousedown.prevent="editor?.chain().focus().toggleBold().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h6a4 4 0 0 1 0 8H7V5zm0 8h7a4 4 0 0 1 0 8H7v-8z"/></svg>
      </button></el-tooltip>
      <el-tooltip content="斜体" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('italic') }" @mousedown.prevent="editor?.chain().focus().toggleItalic().run()">
        <span class="rich-btn-label rich-italic">I</span>
      </button></el-tooltip>
      <el-tooltip content="下划线" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('underline') }" @mousedown.prevent="editor?.chain().focus().toggleUnderline().run()">
        <span class="rich-btn-label rich-u">U</span>
      </button></el-tooltip>
      <el-tooltip content="删除线" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('strike') }" @mousedown.prevent="editor?.chain().focus().toggleStrike().run()">
        <span class="rich-btn-label rich-s">S</span>
      </button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 标题 -->
      <el-tooltip content="标题 1" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('heading', { level: 1 }) }" @mousedown.prevent="editor?.chain().focus().toggleHeading({ level: 1 }).run()"><span class="rich-btn-label">H1</span></button></el-tooltip>
      <el-tooltip content="标题 2" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('heading', { level: 2 }) }" @mousedown.prevent="editor?.chain().focus().toggleHeading({ level: 2 }).run()"><span class="rich-btn-label">H2</span></button></el-tooltip>
      <el-tooltip content="标题 3" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('heading', { level: 3 }) }" @mousedown.prevent="editor?.chain().focus().toggleHeading({ level: 3 }).run()"><span class="rich-btn-label">H3</span></button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 列表 -->
      <el-tooltip content="无序列表" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('bulletList') }" @mousedown.prevent="editor?.chain().focus().toggleBulletList().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>
      </button></el-tooltip>
      <el-tooltip content="有序列表" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('orderedList') }" @mousedown.prevent="editor?.chain().focus().toggleOrderedList().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="8" font-size="7" fill="currentColor" stroke="none">1</text><text x="2.6" y="14" font-size="7" fill="currentColor" stroke="none">2</text><text x="2.6" y="20" font-size="7" fill="currentColor" stroke="none">3</text></svg>
      </button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 引用 -->
      <el-tooltip content="引用块" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('blockquote') }" @mousedown.prevent="editor?.chain().focus().toggleBlockquote().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>
      </button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 代码 -->
      <el-tooltip content="行内代码" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('code') }" @mousedown.prevent="editor?.chain().focus().toggleCode().run()">
        <span class="rich-btn-label rich-code">&lt;/&gt;</span>
      </button></el-tooltip>
      <el-tooltip content="代码块" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive('codeBlock') }" @mousedown.prevent="editor?.chain().focus().toggleCodeBlock().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 对齐 -->
      <!-- 左对齐：默认无 textAlign 属性也视为左对齐（否则 isActive({textAlign:'left'}) 永不匹配）-->
      <el-tooltip content="左对齐" :show-after="300"><button type="button" class="rich-btn" :class="{ active: !(editor?.isActive({ textAlign: 'center' }) || editor?.isActive({ textAlign: 'right' }) || editor?.isActive({ textAlign: 'justify' })) }" @mousedown.prevent="editor?.chain().focus().setTextAlign('left').run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="19" y2="18"/></svg>
      </button></el-tooltip>
      <el-tooltip content="居中" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive({ textAlign: 'center' }) }" @mousedown.prevent="editor?.chain().focus().setTextAlign('center').run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>
      </button></el-tooltip>
      <el-tooltip content="右对齐" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive({ textAlign: 'right' }) }" @mousedown.prevent="editor?.chain().focus().setTextAlign('right').run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="5" y1="18" x2="21" y2="18"/></svg>
      </button></el-tooltip>
      <el-tooltip content="两端对齐" :show-after="300"><button type="button" class="rich-btn" :class="{ active: editor?.isActive({ textAlign: 'justify' }) }" @mousedown.prevent="editor?.chain().focus().setTextAlign('justify').run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 图片（保留） -->
      <el-tooltip :content="projectId ? '插入图片（≤2MB）' : '创建后可补图'" :show-after="300"><button type="button" class="rich-btn" :class="{ disabled: !projectId }" :disabled="!projectId" @mousedown.prevent="fileInputRef?.click()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </button></el-tooltip>
      <span class="rich-sep"></span>

      <!-- 高级 -->
      <el-tooltip content="水平线" :show-after="300"><button type="button" class="rich-btn" @mousedown.prevent="editor?.chain().focus().setHorizontalRule().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="5" x2="21" y2="5" opacity="0.3"/><line x1="3" y1="19" x2="21" y2="19" opacity="0.3"/></svg>
      </button></el-tooltip>
      <el-tooltip content="清除格式" :show-after="300"><button type="button" class="rich-btn" @mousedown.prevent="clearFormat">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button></el-tooltip>

      <!-- 表格 -->
      <span class="rich-sep"></span>
      <el-dropdown trigger="click" @command="(cmd) => handleTableCommand(cmd)" v-if="editor?.isActive('table')">
        <el-tooltip content="表格操作" :show-after="300"><button type="button" class="rich-btn rich-btn-table">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
        </button></el-tooltip>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="addRowAfter">插入行（下方）</el-dropdown-item>
            <el-dropdown-item command="addRowBefore">插入行（上方）</el-dropdown-item>
            <el-dropdown-item command="deleteRow">删除行</el-dropdown-item>
            <el-dropdown-item divided command="addColumnAfter">插入列（右侧）</el-dropdown-item>
            <el-dropdown-item command="addColumnBefore">插入列（左侧）</el-dropdown-item>
            <el-dropdown-item command="deleteColumn">删除列</el-dropdown-item>
            <el-dropdown-item divided command="toggleHeaderRow">切换表头行</el-dropdown-item>
            <el-dropdown-item command="toggleHeaderColumn">切换表头列</el-dropdown-item>
            <el-dropdown-item divided command="mergeCells">合并单元格</el-dropdown-item>
            <el-dropdown-item command="splitCell">拆分单元格</el-dropdown-item>
            <el-dropdown-item divided command="deleteTable" style="color:var(--el-color-danger)">删除表格</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip content="插入表格" :show-after="300" v-else>
        <button type="button" class="rich-btn" @mousedown.prevent="insertTable">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
        </button>
      </el-tooltip>

      <input ref="fileInputRef" type="file" accept="image/png,image/jpeg,image/gif,image/webp" style="display: none" @change="onFilePicked" />
    </div>
    <editor-content :editor="editor" class="rich-content" />
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { toast } from "../toast.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  projectId: { type: String, default: "" },
  placeholder: { type: String, default: "输入内容……" },
});
const emit = defineEmits(["update:modelValue"]);

const fileInputRef = ref(null);
const focused = ref(false);

const editor = useEditor({
  content: props.modelValue || "",
  extensions: [
    StarterKit,
    Underline,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Color,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: false, allowBase64: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
  ],
  // 问题2：Ctrl+V 粘贴剪贴板图片 → 自动上传 + 插入
  editorProps: {
    handlePaste(view, event) {
      const items = event.clipboardData?.items;
      if (!items) return false;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            event.preventDefault();
            uploadAndInsert(file);
            return true;
          }
        }
      }
      return false; // 无图片，走默认粘贴（文本等）
    },
  },
  onUpdate: ({ editor }) => {
    emit("update:modelValue", editor.getHTML());
  },
  // 问题1：编辑器创建完成后强制同步一次外部 modelValue（兜底异步组件时序）
  onCreate: ({ editor }) => {
    if (props.modelValue && editor.getHTML() !== props.modelValue) {
      editor.commands.setContent(props.modelValue, false);
    }
  },
  onFocus: () => { focused.value = true; },
  onBlur: () => { focused.value = false; },
});

// 外部赋值（编辑弹窗打开）时同步内容；immediate + post 处理异步组件挂载晚于父级赋值的情况（问题3）
watch(() => props.modelValue, (v) => {
  if (!editor.value) return;
  const next = v || "";
  if (editor.value.getHTML() !== next) {
    editor.value.commands.setContent(next, false);
  }
}, { immediate: true, flush: "post" });

onBeforeUnmount(() => {
  editor.value?.destroy();
});

// ===== 清除格式 =====
function clearFormat() {
  if (!editor.value) return;
  editor.value.chain().focus().unsetAllMarks().clearNodes().run();
}

// ===== 表格 =====
function insertTable() {
  if (!editor.value) return;
  editor.value.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

function handleTableCommand(cmd) {
  if (!editor.value) return;
  const chain = editor.value.chain().focus();
  chain[cmd]().run();
}

// ===== 图片压缩（上传前本地压缩，减小 base64 体积，编辑器内缩略显示）=====
const MAX_IMG_DIM = 1280; // 最长边上限
const JPEG_QUALITY = 0.82;

/**
 * 用 canvas 压缩图片为 base64 data URL
 * - 超出 MAX_IMG_DIM 的按比例缩小
 * - png 保留透明（仍转 png）；其余统一转 jpeg 压缩体积
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // 注意：不能用 new Image() —— 本文件已 import Tiptap 的 Image 扩展（同名遮蔽），
      // 必须用 window.Image 或 createElement 显式取浏览器全局
      const imgEl = document.createElement("img");
      imgEl.onload = () => {
        try {
          const scale = Math.min(1, MAX_IMG_DIM / Math.max(imgEl.width, imgEl.height));
          const w = Math.max(1, Math.round(imgEl.width * scale));
          const h = Math.max(1, Math.round(imgEl.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(imgEl, 0, 0, w, h);
          const isPng = file.type === "image/png";
          const mime = isPng ? "image/png" : "image/jpeg";
          resolve(canvas.toDataURL(mime, isPng ? undefined : JPEG_QUALITY));
        } catch (err) {
          reject(err);
        }
      };
      imgEl.onerror = reject;
      imgEl.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== 图片插入（本地压缩 → base64 内联，完全绕开网关鉴权，内容自包含）=====
async function uploadAndInsert(file) {
  if (!file || !editor.value) return;
  if (file.size > 2 * 1024 * 1024) {
    toast("单图不能超过 2MB", "error");
    return;
  }
  if (!/^\.(png|jpe?g|gif|webp)$/i.test(file.name) && !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
    toast("仅支持 png / jpg / jpeg / gif / webp 图片", "error");
    return;
  }
  try {
    const dataUrl = await compressImageToDataUrl(file);
    editor.value.chain().focus().setImage({ src: dataUrl }).run();
  } catch (e) {
    console.error("[neo-pm] 图片压缩失败:", e);
    toast("图片处理失败", "error");
  }
}

async function onFilePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) uploadAndInsert(file);
}
</script>

<style scoped>
/* 视觉对齐 Element Plus 弹窗（P2）：白底 + EP 边框/背景变量，去暖黄色调 */
.rich-editor {
  width: 750px;
  max-width: 100%; /* 窄容器下防溢出 */
  border: 1px solid var(--el-border-color, oklch(0.9 0.008 270));
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.rich-editor.focused {
  border-color: var(--el-color-primary, oklch(0.65 0.13 80));
  box-shadow: 0 0 0 3px oklch(0.65 0.13 80 / 0.12);
}
.rich-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, oklch(0.94 0.006 270));
  background: var(--el-fill-color-lighter, #fafafa);
  flex-wrap: wrap;
}
.rich-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--el-text-color-regular, oklch(0.45 0.04 80));
  cursor: pointer;
  transition: all 120ms var(--ease-out);
}
.rich-btn svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
.rich-btn:hover {
  background: var(--el-fill-color, oklch(0.93 0.04 80));
  color: var(--el-text-color-primary, oklch(0.30 0.05 80));
}
.rich-btn.active {
  background: oklch(0.88 0.07 270 / 0.35);
  color: oklch(0.45 0.14 270);
  border-color: oklch(0.82 0.08 270);
}
.rich-btn.disabled,
.rich-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.rich-btn.disabled:hover,
.rich-btn:disabled:hover {
  background: transparent;
  color: var(--el-text-color-regular, oklch(0.45 0.04 80));
}
.rich-btn-label {
  font-weight: 700;
  font-size: 12px;
  font-family: Georgia, serif;
}
.rich-u { text-decoration: underline; }
.rich-s { text-decoration: line-through; }
.rich-italic {
  font-style: italic;
  font-size: 14px;
  font-family: Georgia, serif;
  font-weight: 600;
}
.rich-code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}
.rich-sep {
  width: 1px;
  height: 16px;
  background: var(--el-border-color-lighter, oklch(0.90 0.02 80));
  margin: 0 4px;
  flex-shrink: 0;
}
.rich-content {
  padding: 8px 12px;
  /* 问题4.1：编辑框高度加大 */
  min-height: 320px;
  max-height: 400px;
  overflow-y: auto;
  background: #fff;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--el-text-color-primary, oklch(0.25 0.04 80));
}
.rich-content :deep(.ProseMirror) {
  outline: none;
  min-height: 300px;
  position: relative;
}
.rich-content :deep(.ProseMirror img) {
  max-width: 100%;
  max-height: 220px; /* 缩略显示，编辑时不被大图撑爆；保存后展示层按原尺寸渲染 */
  height: auto;
  width: auto;
  border-radius: 6px;
  margin: 4px 0;
  object-fit: contain;
  cursor: default;
}
.rich-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--el-text-color-placeholder, oklch(0.7 0.015 270));
  float: left;
  height: 0;
  pointer-events: none;
}
.rich-content :deep(.ProseMirror a) {
  color: oklch(0.55 0.15 250);
  text-decoration: underline;
  cursor: pointer;
}
.rich-content :deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--el-border-color, oklch(0.9 0.008 270));
  margin: 8px 0;
  padding: 2px 12px;
  color: var(--el-text-color-secondary, oklch(0.55 0.02 270));
}
.rich-content :deep(.ProseMirror pre) {
  background: oklch(0.97 0.005 270);
  border: 1px solid var(--el-border-color-lighter, oklch(0.94 0.006 270));
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
}
.rich-content :deep(.ProseMirror code) {
  background: oklch(0.96 0.006 270);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.rich-content :deep(.ProseMirror pre code) {
  background: transparent;
  padding: 0;
}
.rich-content :deep(.ProseMirror ul),
.rich-content :deep(.ProseMirror ol) {
  padding-left: 22px;
}
.rich-content :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 4px;
}
.rich-content :deep(.ProseMirror li[data-type="taskItem"]) {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin: 3px 0;
}
.rich-content :deep(.ProseMirror li[data-type="taskItem"] > label) {
  margin-top: 3px;
}

/* 表格样式 */
.rich-content :deep(.ProseMirror table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  overflow: hidden;
  font-size: 13px;
}
.rich-content :deep(.ProseMirror th),
.rich-content :deep(.ProseMirror td) {
  border: 1px solid var(--el-border-color, oklch(0.88 0.008 270));
  padding: 6px 10px;
  min-width: 60px;
  vertical-align: top;
  text-align: left;
}
.rich-content :deep(.ProseMirror th) {
  background: var(--el-fill-color-lighter, oklch(0.96 0.005 270));
  font-weight: 600;
}
.rich-content :deep(.ProseMirror .selectedCell) {
  background: oklch(0.9 0.06 250 / 0.2);
}
.rich-content :deep(.ProseMirror th),
.rich-content :deep(.ProseMirror td) {
  position: relative;
}
.rich-content :deep(.ProseMirror .tableWrapper) {
  overflow-x: auto;
}
.rich-content :deep(.ProseMirror .column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  z-index: 20;
  background-color: var(--el-color-primary, #409eff);
}
</style>
