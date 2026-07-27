<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-wide">
      <h3>{{ isEdit ? '编辑项目' : '新建项目' }}</h3>

      <label class="required">名称（最多20字）</label>
      <input v-model="form.name" type="text" placeholder="项目名称" maxlength="20" :class="{ err: submitErr && !form.name.trim() }">
      <p v-if="submitErr && !form.name.trim()" class="field-err">请填写项目名称</p>

      <label>描述（最多50字）</label>
      <textarea v-model="form.description" placeholder="项目描述" maxlength="50"></textarea>

      <div class="form-row">
        <div><label>计划开始</label><input v-model="form.planStart" type="date"></div>
        <div><label>计划结束</label><input v-model="form.planEnd" type="date"></div>
      </div>
      <div class="form-row">
        <div>
          <label>状态</label>
          <select v-model="form.status">
            <option>待开始</option><option>进行中</option><option>已完成</option>
          </select>
        </div>
        <div>
          <label class="required">项目集</label>
          <select v-model="form.projectSetId" :class="{ err: submitErr && !form.projectSetId }">
            <option value="">请选择项目集</option>
            <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <p v-if="submitErr && !form.projectSetId" class="field-err">请选择项目集</p>
        </div>
      </div>

      <label>成员（逗号分隔）</label>
      <input v-model="form.membersText" type="text" placeholder="张三, 李四">

      <div class="modal-actions">
        <button @click="$emit('close')">取消</button>
        <button class="btn-primary" @click="submit">{{ isEdit ? '保存' : '创建' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: "create" }, // "create" | "edit"
  data: { type: Object, default: null },
  defaultSetId: { type: String, default: "" },
  sets: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "save"]);

const isEdit = computed(() => props.mode === "edit");

const form = reactive({
  id: "", name: "", description: "", planStart: "", planEnd: "",
  status: "待开始", projectSetId: "", membersText: "",
});
const submitErr = ref(false);

watch(() => props.show, (v) => {
  if (v) {
    if (isEdit.value && props.data) {
      const d = props.data;
      form.id = d.id;
      form.name = d.name;
      form.description = d.description || "";
      form.planStart = d.planStart || "";
      form.planEnd = d.planEnd || "";
      form.status = d.status;
      form.projectSetId = d.projectSetId || "";
      form.membersText = (d.members || []).join(", ");
    } else {
      form.id = "";
      form.name = "";
      form.description = "";
      form.planStart = "";
      form.planEnd = "";
      form.status = "待开始";
      form.projectSetId = props.defaultSetId;
      form.membersText = "";
    }
    submitErr.value = false;
  }
});

function submit() {
  if (!form.name.trim() || !form.projectSetId) {
    submitErr.value = true;
    return;
  }
  const members = form.membersText.split(",").map((s) => s.trim()).filter(Boolean);
  emit("save", {
    id: form.id,
    name: form.name.trim(),
    description: form.description.trim(),
    planStart: form.planStart,
    planEnd: form.planEnd,
    status: form.status,
    projectSetId: form.projectSetId,
    members,
  });
}
</script>

<style scoped>
.modal-wide {
  max-width: 600px;
  width: 90%;
}
.required::after {
  content: ' *';
  color: oklch(0.55 0.2 30);
}
.field-err {
  margin: -10px 0 14px;
  font-size: 12px;
  color: oklch(0.55 0.2 30);
}
input.err, select.err {
  border-color: oklch(0.55 0.2 30);
}
</style>
