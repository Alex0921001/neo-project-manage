<template>
  <FloatPanel
    :model-value="show"
    :title="title"
    :default-width="width"
    :default-height="height"
    :min-width="minWidth"
    :min-height="minHeight"
    @update:model-value="(v) => emit('update:show', v)"
  >
    <div class="form-dialog-body">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="form-dialog-form"
        @submit.prevent="handleSubmit"
      >
        <slot />
      </el-form>
    </div>
    <template #footer>
      <el-button @click="emitCancel">取消</el-button>
      <el-button class="form-dialog-save" :loading="saving" @click="handleSubmit">{{ saveText }}</el-button>
    </template>
  </FloatPanel>
</template>

<script setup>
import { ref } from "vue";
import FloatPanel from "./FloatPanel.vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: "" },
  width: { type: Number, default: 720 },
  height: { type: Number, default: 560 },
  minWidth: { type: Number, default: 420 },
  minHeight: { type: Number, default: 320 },
  form: { type: Object, default: null },
  rules: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  saveText: { type: String, default: "保存" },
});
const emit = defineEmits(["update:show", "cancel", "save"]);

const formRef = ref(null);

function emitCancel() {
  emit("update:show", false);
  emit("cancel");
}

async function handleSubmit() {
  // 有 form 校验则先校验；无 form（如纯项目集名称）则直接提交，由父级做校验
  if (formRef.value) {
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;
  }
  emit("save");
}
</script>

<style scoped>
.form-dialog-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  background: var(--bg-card);
}
.form-dialog-form {
  flex: 1 0 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
/* 内容区自适应：加 form-stretch 的最后一项（描述/简述/备注）撑满剩余高度；
   弹窗拖大时富文本/文本域跟随填满，小窗时不小于 min-height，超出走 body 滚动 */
.form-dialog-form :deep(.el-form-item.form-stretch) {
  flex: 1;
  min-height: 150px;
  display: flex;
  flex-direction: column;
}
.form-dialog-form :deep(.el-form-item.form-stretch .el-form-item__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.form-dialog-form :deep(.el-form-item.form-stretch .el-form-item__content > *) {
  flex: 1;
}
/* 文本域撑满（项目描述） */
.form-dialog-form :deep(.el-form-item.form-stretch .el-textarea),
.form-dialog-form :deep(.el-form-item.form-stretch .el-textarea__inner) {
  height: 100%;
}
.form-dialog-form :deep(.el-form-item.form-stretch .el-textarea__inner) {
  resize: none;
}
</style>

<style>
/* 保存按钮：黑底白字（FloatPanel teleport 到 body，需全局样式） */
.form-dialog-save.el-button {
  background: var(--text) !important;
  border-color: var(--text) !important;
  color: #fff !important;
  font-weight: 600;
}
.form-dialog-save.el-button:hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
  color: #fff !important;
}
.form-dialog-save.el-button.is-loading {
  background: var(--text) !important;
  border-color: var(--text) !important;
}
</style>
