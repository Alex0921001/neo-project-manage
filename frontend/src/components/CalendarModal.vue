<template>
  <FloatPanel
    :model-value="modelValue"
    title="项目日历"
    :default-width="1100"
    :default-height="720"
    :min-width="520"
    :min-height="420"
    :max-width="1800"
    :max-height="1200"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="cal-modal-body">
      <CalendarWidget
        :projects="projects"
        :sets="sets"
        :compact="false"
        :task-mode="taskMode"
        :project-id="projectId"
        :project-set-id="projectSetId"
        @select="(id) => emit('select', id)"
        @select-task="(payload) => emit('select-task', payload)"
      />
    </div>
  </FloatPanel>
</template>

<script setup>
import FloatPanel from "./FloatPanel.vue";
import CalendarWidget from "./CalendarWidget.vue";

defineProps({
  modelValue: { type: Boolean, default: false },
  projects: { type: Array, default: () => [] },
  sets: { type: Array, default: () => [] },
  taskMode: { type: Boolean, default: false }, // true=单项目任务日历（详情页），false=全项目日历（列表页）
  projectId: { type: String, default: "" },
  projectSetId: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue", "select", "select-task"]);
</script>

<style scoped>
.cal-modal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 14px 14px;
  overflow: hidden;
}
.cal-modal-body :deep(.calendar-widget),
.cal-modal-body :deep(.fc) {
  flex: 1;
  min-height: 0;
}
</style>
