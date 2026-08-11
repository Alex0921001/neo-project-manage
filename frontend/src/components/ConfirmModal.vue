<template>
  <el-dialog
    :model-value="show"
    title="确认"
    width="360px"
    :close-on-click-modal="false"
    append-to-body
    :z-index="z"
    @close="$emit('close')"
  >
    <p class="confirm-body">{{ message }}</p>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="danger" @click="$emit('confirm')">{{ confirmText }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from "vue";
import { nextZIndex } from "../utils/zIndex.js";

const props = defineProps({
  show: Boolean,
  message: { type: String, default: "" },
  confirmText: { type: String, default: "确认删除" },
});
defineEmits(["close", "confirm"]);

// 打开时动态取层级（高于已开的浮动面板/其他弹窗）
const z = ref(0);
watch(() => props.show, (v) => {
  if (v) z.value = nextZIndex();
});
</script>

<style scoped>
.confirm-body { font-size: 14px; margin: 0 0 8px; }
</style>
