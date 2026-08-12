<template>
  <Teleport to="body">
    <!-- 右下角常驻入口：克制圆形 ? 按钮（浅色底、墨色字，避让右下角版本角标） -->
    <button class="cs-fab" title="功能速查" @click="open">?</button>

    <!-- 速查弹窗：标题 + 关闭 + 可滚动内容 + 底部版本号 -->
    <div
      v-if="show"
      class="cs-panel"
      :style="{ zIndex: z }"
      role="dialog"
      aria-label="功能速查"
    >
      <div class="cs-head">
        <span class="cs-title">功能速查</span>
        <button class="cs-close" title="关闭" @click="close">✕</button>
      </div>
      <div class="cs-body">
        <div v-if="state === 'loading'" class="cs-tip">加载中…</div>
        <div v-else-if="state === 'error'" class="cs-tip cs-error">{{ error }}</div>
        <div v-else class="cs-markdown" v-html="html"></div>
      </div>
      <div class="cs-foot">当前版本 v{{ version }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from "vue";
import MarkdownIt from "markdown-it";
import { api } from "../api.js";
import { nextZIndex } from "../utils/zIndex.js";

// 内容为插件自带 capabilities.md（可信），html:false 保持默认转义防御
const md = new MarkdownIt({ html: false, linkify: true });

const show = ref(false);
const z = ref(0);
const state = ref("idle"); // idle | loading | error | done
const error = ref("");
const html = ref("");
const version = ref("");

function open() {
  if (show.value) return;
  show.value = true;
  z.value = nextZIndex(); // 后打开永远更高，不与批注大屏/确认框冲突
  load();
}

function close() {
  show.value = false;
}

// 每次打开实时拉取：后端运行时读 docs/capabilities.md，内容更新无需重新构建
async function load() {
  state.value = "loading";
  error.value = "";
  try {
    const res = await api("api/capabilities", { silent: true });
    if (res?.ok && res.data?.markdown) {
      html.value = md.render(res.data.markdown);
      version.value = res.data.version || "?";
      state.value = "done";
    } else {
      throw new Error(res?.error || "内容加载失败");
    }
  } catch (e) {
    error.value = e.message || "内容加载失败";
    state.value = "error";
  }
}
</script>

<style scoped>
/* === 右下角入口 === */
.cs-fab {
  position: fixed;
  right: 20px;
  bottom: 40px; /* 避让右下角版本角标（bottom 6px 区域） */
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: all var(--duration-fast) var(--ease-out);
  z-index: 950; /* 低于版本角标 999 与所有动态浮层（nextZIndex 从现存最高值起算） */
}
.cs-fab:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

/* === 弹窗骨架（风格对齐 FloatPanel） === */
.cs-panel {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 660px;
  max-width: calc(100vw - 32px);
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.cs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  user-select: none;
}
.cs-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.02em;
  flex: 1;
  min-width: 0;
}
.cs-close {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.cs-close:hover {
  background: var(--bg-hover);
  color: var(--danger);
  border-color: var(--danger);
}
.cs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
}
.cs-tip {
  padding: 40px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.cs-error { color: var(--danger); }
.cs-foot {
  flex-shrink: 0;
  border-top: 1px solid var(--border-light);
  padding: 8px 16px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--text-tertiary);
  background: var(--bg-card);
  user-select: text;
}

/* === Markdown 渲染样式（自定义适配主题，不用默认样式） === */
.cs-markdown :deep(h2) {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 20px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}
.cs-markdown :deep(h2:first-child) { margin-top: 0; }
.cs-markdown :deep(h3) {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  margin: 16px 0 8px;
}
.cs-markdown :deep(p) {
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.cs-markdown :deep(strong) { color: var(--text); font-weight: 600; }
.cs-markdown :deep(ul),
.cs-markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}
.cs-markdown :deep(li) {
  margin: 3px 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.cs-markdown :deep(code) {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-hover);
  color: var(--text);
  padding: 1px 5px;
  border-radius: 4px;
}
.cs-markdown :deep(pre) {
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  overflow-x: auto;
  margin: 10px 0;
}
.cs-markdown :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 12px;
  line-height: 1.6;
}
.cs-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12.5px;
}
.cs-markdown :deep(th) {
  text-align: left;
  font-weight: 600;
  color: var(--text);
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  padding: 6px 10px;
  white-space: nowrap;
}
.cs-markdown :deep(td) {
  border: 1px solid var(--border-light);
  padding: 5px 10px;
  color: var(--text-secondary);
  vertical-align: top;
}
.cs-markdown :deep(tr:nth-child(even) td) { background: var(--bg); }
.cs-markdown :deep(blockquote) {
  margin: 10px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--accent-subtle);
  color: var(--text-secondary);
  font-size: 13px;
}
.cs-markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-light);
  margin: 16px 0;
}
.cs-markdown :deep(a) { color: var(--link); text-decoration: none; }
.cs-markdown :deep(a:hover) { text-decoration: underline; }
</style>
