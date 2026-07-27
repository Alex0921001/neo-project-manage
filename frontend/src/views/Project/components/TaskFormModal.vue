<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-wide">
      <h3>
        <template v-if="mode === 'subtask'">子任务 · （父级任务：{{ parentTask?.name }}）</template>
        <template v-else-if="mode === 'edit'">编辑任务</template>
        <template v-else>新建任务</template>
      </h3>
      <label>名称</label>
      <input v-model="form.name" type="text" placeholder="任务名称" :class="{ err: submitErr && !form.name.trim() }">
      <p v-if="submitErr && !form.name.trim()" class="field-err">请填写任务名称</p>
      <label>简述</label>
      <TaskEditor v-model="form.description" />
      <div class="modal-actions">
        <button @click="$emit('close')">取消</button>
        <button class="btn-primary" @click="submit">{{ mode === 'edit' ? '保存' : '创建' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import TaskEditor from "./TaskEditor.vue";

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: "create" },
  data: { type: Object, default: null },
  parentTask: { type: Object, default: null },
});
const emit = defineEmits(["close", "save"]);

const isEdit = computed(() => props.mode === "edit");

const form = reactive({ name: "", description: "" });
const submitErr = ref(false);

watch(() => props.show, (v) => {
  if (v) {
    if (isEdit.value && props.data) {
      form.name = props.data.name;
      form.description = props.data.description || "";
    } else {
      form.name = "";
      form.description = "";
    }
    submitErr.value = false;
  }
});

function submit() {
  if (!form.name.trim()) {
    submitErr.value = true;
    return;
  }
  emit("save", {
    name: form.name.trim(),
    description: form.description.trim(),
  });
}
</script>

<style scoped>
.field-err {
  margin: -10px 0 14px;
  font-size: 12px;
  color: oklch(0.55 0.2 30);
}
input.err {
  border-color: oklch(0.55 0.2 30);
}
label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
</style>
