<template>
  <FormDialog
    :show="show"
    :title="isEdit ? '编辑项目' : '新建项目'"
    :width="800"
    :height="620"
    :form="form"
    :rules="rules"
    :saving="saving"
    :save-text="isEdit ? '保存' : '创建'"
    @update:show="(v) => { if (!v) $emit('close') }"
    @cancel="$emit('close')"
    @save="submit"
  >
    <!-- 第一行：名称 -->
    <el-form-item label="名称" prop="name">
      <el-input v-model="form.name" placeholder="项目名称" maxlength="20" show-word-limit />
    </el-form-item>

    <!-- 第二行：项目集 + 状态 -->
    <div class="form-row">
      <el-form-item label="项目集">
        <el-select v-model="form.projectSetId" placeholder="请选择项目集（可不选）" clearable style="width: 100%">
          <el-option label="未归类" value="" />
          <el-option v-for="s in sets" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option label="待开始" value="待开始" />
          <el-option label="进行中" value="进行中" />
          <el-option label="已完成" value="已完成" />
          <el-option label="已取消" value="已取消" />
        </el-select>
      </el-form-item>
    </div>

    <!-- 第三行：计划周期 + 成员 -->
    <div class="form-row">
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
      <el-form-item label="成员">
        <MemberSelect v-model="form.members" />
      </el-form-item>
    </div>

    <!-- 第四行：描述（form-stretch：撑满剩余高度） -->
    <el-form-item label="描述" class="form-stretch">
      <el-input
        v-model="form.description"
        type="textarea"
        :rows="4"
        resize="none"
        placeholder="一句话描述项目目标（可选）"
      />
    </el-form-item>
  </FormDialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { normalizeRichText, richTextToPlain } from "../../../utils/text.js";
import MemberSelect from "../../../components/MemberSelect.vue";
import FormDialog from "../../../components/FormDialog.vue";

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: "create" }, // "create" | "edit"
  data: { type: Object, default: null },
  defaultSetId: { type: String, default: "" },
  sets: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "save"]);

const isEdit = computed(() => props.mode === "edit");

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
  if (v) {
    if (isEdit.value && props.data) {
      const d = props.data;
      form.id = d.id;
      form.name = d.name;
      form.description = richTextToPlain(d.description || "");
      form.planStart = d.planStart || "";
      form.planEnd = d.planEnd || "";
      planRangeVal.value = form.planStart || form.planEnd
        ? [form.planStart || null, form.planEnd || null]
        : [];
      // 防御：状态不在合法选项内时 fallback 到 "待开始"，避免 select 显示空白
      form.status = ["待开始", "进行中", "已完成", "已取消"].includes(d.status) ? d.status : "待开始";
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
  }
});

async function submit() {
  if (dateRangeErr.value) return;
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
