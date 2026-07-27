<template>
  <div class="detail-header">
    <h1>{{ title }}</h1>
    <button class="btn-icon" @click="$emit('edit')">✎</button>
  </div>
</template>

<script setup>
defineProps({ title: String });
defineEmits(["edit"]);
</script>

<style scoped>
.detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.detail-header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.3; }
</style>
