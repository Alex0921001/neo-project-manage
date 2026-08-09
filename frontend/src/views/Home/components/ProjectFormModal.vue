<template>
  <el-dialog
    :model-value="show"
    :title="isEdit ? '编辑项目' : '新建项目'"
    width="800px"
    :close-on-click-modal="false"
    append-to-body
    @close="$emit('close')"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <!-- 基本信息 -->
      <div class="form-section-title">基本信息</div>
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="项目名称" maxlength="20" show-word-limit />
      </el-form-item>

      <!-- 时间安排 -->
      <div class="form-section-title">时间安排</div>
      <el-form-item label="计划周期">
        <el-date-picker
          v-model="planRangeVal"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="计划开始"
          end-placeholder="计划结束"
          style="width: 100%"
        />
        <div v-if="dateRangeErr" class="field-err">结束日期不能早于开始日期</div>
      </el-form-item>

      <!-- 归属：状态 + 项目集 同一行 -->
      <div class="form-section-title">归属</div>
      <div class="form-row">
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="待开始" value="待开始" />
            <el-option label="进行中" value="进行中" />
            <el-option label="已完成" value="已完成" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目集">
          <el-select v-model="form.projectSetId" placeholder="请选择项目集（可不选）" clearable style="width: 100%">
            <el-option label="未归类" value="" />
            <el-option v-for="s in sets" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </div>

      <!-- 成员 -->
      <el-form-item label="成员">
        <el-select
          v-model="form.members"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="请选择成员（可输入新增）"
          style="width: 100%"
        >
          <el-option v-for="m in memberOptions" :key="m" :label="m" :value="m" />
        </el-select>
      </el-form-item>

      <!-- 描述（富文本，置于表单最后一行）-->
      <el-form-item label="描述">
        <RichEditor
          v-model="form.description"
          :project-id="projectId"
          placeholder="一句话描述项目目标（可选）"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ isEdit ? '保存' : '创建' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { api } from "../../../api.js";
import { normalizeRichText } from "../../../utils/text.js";
import { createRichEditor } from "../../../utils/asyncEditor.js";
// 富文本编辑器异步加载（含 loading/error/重试）
const RichEditor = createRichEditor();

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: "create" }, // "create" | "edit"
  data: { type: Object, default: null },
  defaultSetId: { type: String, default: "" },
  sets: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "save"]);

const isEdit = computed(() => props.mode === "edit");
const projectId = computed(() => (props.data?.id) || "");

// 成员候选池：聚合所有项目的 members（P2-2/3：新建项目时下拉也有候选）
const allMembers = ref([]);
async function loadAllMembers() {
  const res = await api("api/projects");
  if (res?.ok && Array.isArray(res.data)) {
    const set = new Set();
    for (const p of res.data) {
      for (const m of (p.members || [])) set.add(String(m).trim());
    }
    allMembers.value = [...set];
  }
}
// 候选 = 全局聚合 + 当前已输入（去重），allow-create 新输入自动并入 form.members
const memberOptions = computed(() => {
  const set = new Set([...allMembers.value, ...form.members]);
  return [...set];
});

const formRef = ref(null);
const saving = ref(false);
const form = reactive({
  id: "", name: "", description: "", planStart: "", planEnd: "",
  status: "待开始", projectSetId: "", members: [],
});

const rules = {
  name: [
    { required: true, message: "请填写项目名称", trigger: "blur" },
    { min: 1, max: 20, message: "名称限 1-20 个字符", trigger: "blur" },
  ],
};

// 计划周期 range 绑定：同步到 form.planStart / form.planEnd
const planRangeVal = ref([]);
watch(planRangeVal, (v) => {
  form.planStart = v?.[0] || "";
  form.planEnd = v?.[1] || "";
});

// 日期范围校验
const dateRangeErr = computed(() => {
  if (!form.planStart || !form.planEnd) return false;
  return form.planEnd < form.planStart;
});

watch(() => props.show, (v) => {
  if (v) loadAllMembers();
  if (v) {
    if (isEdit.value && props.data) {
      const d = props.data;
      form.id = d.id;
      form.name = d.name;
      form.description = d.description || "";
      form.planStart = d.planStart || "";
      form.planEnd = d.planEnd || "";
      planRangeVal.value = form.planStart || form.planEnd
        ? [form.planStart || null, form.planEnd || null]
        : [];
      // 防御：状态不在三个合法选项内时 fallback 到 "待开始"，避免 select 显示空白
      form.status = ["待开始", "进行中", "已完成"].includes(d.status) ? d.status : "待开始";
      form.projectSetId = d.projectSetId || "";
      form.members = Array.isArray(d.members) ? [...d.members] : [];
    } else {
      form.id = "";
      form.name = "";
      form.description = "";
      form.planStart = "";
      form.planEnd = "";
      planRangeVal.value = [];
      form.status = "待开始";
      form.projectSetId = props.defaultSetId;
      form.members = [];
    }
    formRef.value?.clearValidate();
  }
});

async function submit() {
  if (dateRangeErr.value) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    emit("save", {
      id: form.id,
      name: form.name.trim(),
      description: normalizeRichText(form.description),
      planStart: form.planStart,
      planEnd: form.planEnd,
      status: form.status,
      projectSetId: form.projectSetId,
      // P2-2/3：trim + 去重后提交
      members: [...new Set(form.members.map((m) => String(m).trim()).filter(Boolean))],
    });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.form-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 4px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.form-row {
  display: flex;
  gap: 14px;
}
.form-row .el-form-item {
  flex: 1;
  min-width: 0;
}
.field-err {
  margin-top: 6px;
  font-size: 12px;
  color: var(--danger);
}
</style>
