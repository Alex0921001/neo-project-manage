<template>
  <div>
    <label>简述（支持富文本）</label>
    <div class="editor-toolbar" @mousedown.prevent>
      <button type="button" @click="execCmd('bold')" title="粗体"><b>B</b></button>
      <button type="button" @click="execCmd('italic')" title="斜体"><i>I</i></button>
      <button type="button" @click="execCmd('underline')" title="下划线"><u>U</u></button>
      <span class="toolbar-sep"></span>
      <button type="button" @click="execCmd('insertUnorderedList')" title="无序列表">•</button>
      <button type="button" @click="execCmd('insertOrderedList')" title="有序列表">1.</button>
    </div>
    <div
      contenteditable="true"
      class="rich-editor"
      @input="onInput"
      v-html="modelValue"
    ></div>
  </div>
</template>

<script setup>
defineProps({ modelValue: { type: String, default: "" } });
const emit = defineEmits(["update:modelValue"]);

function onInput(e) { emit("update:modelValue", e.target.innerHTML); }
function execCmd(cmd) {
  document.execCommand(cmd, false, null);
  const sel = window.getSelection();
  if (sel?.rangeCount > 0) {
    const ed = sel.getRangeAt(0).startContainer?.closest?.(".rich-editor");
    if (ed) ed.focus();
  }
}
</script>

<style scoped>
.editor-toolbar {
  display: flex; gap: 2px; padding: 6px 8px;
  border: 1px solid var(--border); border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: var(--bg-card);
}
.editor-toolbar button {
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; font-size: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-secondary); transition: background var(--duration-fast) var(--ease-out);
}
.editor-toolbar button:hover { background: var(--bg-hover); color: var(--text); }
.toolbar-sep { width: 1px; background: var(--border-light); margin: 4px 4px; }
.rich-editor {
  min-height: 600px; max-height: none; overflow-y: auto;
  padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  background: var(--bg-card); color: var(--text);
  font-size: 13px; line-height: 1.6; outline: none;
}
.rich-editor:focus { border-color: var(--accent); }
.rich-editor :deep(ul), .rich-editor :deep(ol) { padding-left: 20px; margin: 4px 0; }
</style>
