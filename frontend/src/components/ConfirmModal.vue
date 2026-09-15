<template>
  <Teleport to="body">
    <Transition name="cm-fade">
      <div v-if="show" class="cm-overlay" :style="{ zIndex: overlayZ }">
        <div class="cm-dialog" role="alertdialog" aria-modal="true">
          <div class="cm-title">{{ title }}</div>
          <p class="cm-body">{{ message }}</p>
          <div class="cm-footer">
            <button type="button" class="cm-btn" @click="$emit('close')">{{ cancelText }}</button>
            <button type="button" class="cm-btn cm-btn-danger" @click="$emit('confirm')">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { nextZIndex } from "../utils/zIndex.js";

const props = defineProps({
  show: Boolean,
  message: { type: String, default: "" },
  confirmText: { type: String, default: "确认删除" },
  cancelText: { type: String, default: "取消" },
  title: { type: String, default: "确认" },
  // 编程式调用（utils/confirm.js 单例）时传入实际层级；模板用法传空则自行取号
  z: { type: Number, default: 0 },
});
const emit = defineEmits(["close", "confirm"]);

// 自研弹层（替代 el-dialog）：与 FloatPanel 共用 zIndex.js 统一计数器。
// 层级：编程式由外部传入（confirm.js 统一取号 + enforceTop 兜底）；模板式打开时自行取号
const ownZ = ref(0);
watch(() => props.show, (v) => {
  if (v && !props.z) ownZ.value = nextZIndex();
});
const overlayZ = computed(() => props.z || ownZ.value);

// Esc 取消：捕获阶段拦截并吞掉，不冒泡到 FloatPanel 的 Esc 关闭链（避免误关底层弹窗）
function onKeydown(e) {
  if (!props.show || e.key !== "Escape") return;
  e.stopPropagation();
  e.preventDefault();
  emit("close");
}
document.addEventListener("keydown", onKeydown, true);
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<style scoped>
.cm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cm-dialog {
  width: 360px;
  box-sizing: border-box;
  background: var(--bg-card, var(--bg));
  border: 0.5px solid var(--border);
  border-radius: 10px;
  padding: 15px 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
.cm-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.cm-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  margin: 10px 0 14px;
  white-space: pre-line;
  word-break: break-word;
}
.cm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.cm-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: 0.5px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
}
.cm-btn:hover { border-color: var(--text); }
.cm-btn-danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.cm-btn-danger:hover { filter: brightness(1.08); border-color: var(--danger); }

.cm-fade-enter-active,
.cm-fade-leave-active { transition: opacity 0.12s ease; }
.cm-fade-enter-from,
.cm-fade-leave-to { opacity: 0; }
</style>
