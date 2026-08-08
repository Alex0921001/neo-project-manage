<template>
  <el-dialog
    :model-value="show"
    title="确认"
    width="360px"
    :close-on-click-modal="false"
    append-to-body
    @close="$emit('close')"
  >
    <p class="confirm-body">{{ message }}</p>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="danger" @click="$emit('confirm')">确认删除</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  show: Boolean,
  message: { type: String, default: "" },
});
defineEmits(["close", "confirm"]);
</script>

<style scoped>
.confirm-body { font-size: 14px; margin: 0 0 8px; }
</style>
