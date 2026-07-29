<template>
  <div
    :class="['set-card', { active: isActive }]"
    @click="$emit('select', set.id)"
  >
    <div class="set-color" :style="{ background: color }"></div>
    <div class="set-main">
      <div class="set-name">{{ set.name }}</div>
      <div class="set-meta">{{ set.projectCount }} 个项目</div>
    </div>
    <div class="set-actions" @click.stop>
      <button class="set-more" title="更多" @click="open = !open">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
      <div :class="['set-dropdown', { open }]">
        <button @click="open = false; $emit('edit', set)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          编辑
        </button>
        <button class="dropdown-danger" @click="open = false; $emit('delete', set)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          删除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  set: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  color: { type: String, default: "" },
});
defineEmits(["select", "edit", "delete"]);

const open = ref(false);
</script>

<style scoped>
.set-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.15s ease-out;
  margin: 0 4px 4px;
  border: 1px solid transparent;
  background: #ffffff;
  position: relative;
}
.set-card:hover { background: #f9fafb; border-color: #e5e7eb; }
.set-card.active {
  background: #f3f4f6;
  border-color: #d1d5db;
}
.set-color {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  flex-shrink: 0;
}
.set-main { flex: 1; min-width: 0; }
.set-name {
  font-weight: 600;
  font-size: 13px;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.set-meta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
  font-weight: 500;
}
.set-card.active .set-meta { color: #6b7280; }

.set-actions { position: relative; flex-shrink: 0; }
.set-more {
  width: 24px; height: 24px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease-out;
}
.set-card:hover .set-more { opacity: 1; }
.set-more:hover { background: #ffffff; color: #1f2937; border-color: #e5e7eb; }

.set-dropdown {
  display: none;
  position: absolute;
  top: 28px; right: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05);
  z-index: 100;
  min-width: 110px;
  padding: 4px;
  animation: dropIn 0.15s ease-out;
}
.set-dropdown.open { display: block; }
.set-dropdown button {
  display: flex; align-items: center; gap: 7px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  color: #1f2937;
  border-radius: 6px;
  transition: background 0.12s ease-out;
}
.set-dropdown button:hover { background: #f3f4f6; }
.set-dropdown .dropdown-danger { color: #dc2626; }
.set-dropdown .dropdown-danger:hover { background: #fef2f2; }

@keyframes dropIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
