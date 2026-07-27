<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal">
      <h3>确认</h3>
      <p class="confirm-body">{{ message }}</p>
      <div class="modal-actions">
        <button @click="$emit('close')">取消</button>
        <button class="btn-primary btn-danger" @click="$emit('confirm')">确认删除</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: Boolean,
  message: { type: String, default: "" },
});
defineEmits(["close", "confirm"]);
</script>

<style scoped>
.confirm-body { font-size: 14px; margin: 0 0 16px; }
</style>
