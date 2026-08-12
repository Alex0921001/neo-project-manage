<template>
  <div class="member-select">
    <el-select
      ref="selectRef"
      :model-value="modelValue"
      multiple
      filterable
      :allow-create="effectiveAllowCreate"
      default-first-option
      :placeholder="placeholder"
      :clearable="clearable"
      collapse-tags
      collapse-tags-tooltip
      style="width: 100%"
      @update:model-value="(v) => emit('update:modelValue', v)"
      @visible-change="(v) => (dropdownVisible = v)"
    >
      <!-- 选项 = 全局成员 ∪ 历史人名；历史人名 isHistoric 浅灰样式区分 -->
      <el-option
        v-for="opt in visibleOptions"
        :key="opt.name"
        :label="opt.name"
        :value="opt.name"
      >
        <span class="member-opt" :class="{ 'member-opt-historic': opt.isHistoric }">
          {{ opt.name }}
          <em v-if="opt.isHistoric" class="member-opt-tag">历史</em>
        </span>
      </el-option>

      <!-- 末位固定「人员管理」入口（el-select footer 自带 click.stop，点击不收起下拉） -->
      <template #footer>
        <button type="button" class="member-manage-entry" @click="openManage">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>人员管理</span>
        </button>
      </template>
    </el-select>

    <!-- 成员管理弹窗：数据变更后刷新选项 -->
    <MemberManageModal :show="manageShow" @close="manageShow = false" @changed="loadAll" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "../api.js";
import MemberManageModal from "./MemberManageModal.vue";

const props = defineProps({
  // 已选成员（人名数组，v-model 双向绑定）
  modelValue: { type: Array, default: () => [] },
  // 候选池限制：传入时选项 = 全局成员 ∪ 历史人名 ∩ 候选池（任务侧限定项目成员，避免选中后被后端归属校验拒绝）
  restrictTo: { type: Array, default: null },
  placeholder: { type: String, default: "请选择成员（可输入新增）" },
  // 允许输入新名字直接添加（restrictTo 非空时强制关闭，新输入会被后端拒绝）
  allowCreate: { type: Boolean, default: true },
  clearable: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "changed"]);

const selectRef = ref(null);
const dropdownVisible = ref(false);
const manageShow = ref(false);

// 全部已知人名：GET /api/members/all-known → [{ name, isHistoric }]
const options = ref([]);
async function loadAll() {
  const res = await api("api/members/all-known");
  if (res?.ok && Array.isArray(res.data)) options.value = res.data;
}
onMounted(loadAll);

// 选项 = 全局 ∪ 历史（restrictTo 过滤）+ 已选值兜底（回显不丢）
const visibleOptions = computed(() => {
  let list = options.value.slice();
  if (props.restrictTo?.length) {
    const pool = new Set(props.restrictTo);
    list = list.filter((o) => pool.has(o.name));
  }
  const names = new Set(list.map((o) => o.name));
  for (const n of props.modelValue || []) {
    if (n && !names.has(n)) {
      list.push({ name: n, isHistoric: false });
      names.add(n);
    }
  }
  return list;
});

const effectiveAllowCreate = computed(() => props.allowCreate && !props.restrictTo?.length);

function openManage() {
  manageShow.value = true;
  closeDropdown();
}

// 收起下拉：优先组件实例 toggleMenu（EP 部分版本暴露），否则 body.click 兜底（触发 click-outside）
function closeDropdown() {
  if (!dropdownVisible.value) return;
  const inst = selectRef.value;
  if (inst && typeof inst.toggleMenu === "function") inst.toggleMenu();
  else document.body.click();
}
</script>

<style scoped>
.member-select {
  width: 100%;
}

/* 历史人名：浅灰样式 + 「历史」角标 */
.member-opt {
  display: flex;
  align-items: center;
  gap: 6px;
}
.member-opt-historic {
  color: var(--text-tertiary);
}
.member-opt-tag {
  font-style: normal;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--text-tertiary);
  background: var(--bg-hover);
}

/* 底部固定「人员管理」入口 */
.member-manage-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-top: 1px solid var(--border-light);
  border-radius: 0;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.member-manage-entry:hover {
  color: var(--accent);
  background: var(--bg-hover);
}
</style>
