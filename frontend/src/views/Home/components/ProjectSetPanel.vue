<template>
  <div class="set-panel">
    <div class="panel-header">
      <div class="header-main">
        <h2>项目集</h2>
        <div class="header-sub">{{ sets.length }} 个</div>
      </div>
      <div class="header-actions">
        <button class="search-toggle" :class="{ active: showSearch }" @click="showSearch = !showSearch" title="搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        </button>
        <button class="add-btn" @click="openAdd" title="新建项目集">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>

    <transition name="search">
      <div v-if="showSearch" class="search-area">
        <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        <input v-model="search" class="search-input" placeholder="搜索项目集...">
      </div>
    </transition>

    <!-- 全部项目 -->
    <div :class="['all-card', { active: selectedId === null }]" @click="$emit('select-set', null)">
      <div class="all-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      </div>
      <div class="all-text">
        <div class="all-name">全部项目</div>
        <div class="all-meta">{{ totalProjectCount }} 个项目</div>
      </div>
    </div>

    <div class="divider">
      <span>分组</span>
    </div>

    <div v-if="filteredSets.length === 0 && search" class="empty-state">暂无匹配</div>
    <SetCard
      v-for="(s, idx) in filteredSets"
      :key="s.id"
      :set="s"
      :is-active="s.id === selectedId"
      :color="pickPaletteColor(idx)"
      @select="$emit('select-set', s.id)"
      @edit="startEdit"
      @delete="startDelete"
    />

    <!-- Set 弹窗（新建/编辑，el-dialog + el-form） -->
    <el-dialog
      v-model="dialogShow"
      :title="dialogMode === 'add' ? '新建项目集' : '编辑项目集'"
      width="400px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form ref="formRef" :model="setForm" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="名称" prop="name">
          <el-input v-model="setForm.name" maxlength="10" show-word-limit placeholder="最多10字" @keyup.enter="doSave" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogShow = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">{{ dialogMode === 'add' ? '创建' : '保存' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { pickPaletteColor } from "../../../utils/palette.js";
import SetCard from "./SetCard.vue";

const props = defineProps({
  sets: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
});
const emit = defineEmits(["select-set", "changed", "confirm-ask"]);

const search = ref("");
const showSearch = ref(false);
const dialogShow = ref(false);
const dialogMode = ref("add"); // "add" | "edit"
const editTargetId = ref(null);
const saving = ref(false);
const formRef = ref(null);
const setForm = reactive({ name: "" });

const rules = {
  name: [
    { required: true, message: "请填写项目集名称", trigger: "blur" },
    { min: 1, max: 10, message: "名称限 1-10 个字符", trigger: "blur" },
  ],
};

const filteredSets = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.sets;
  return props.sets.filter((s) => s.name.toLowerCase().includes(q));
});

const totalProjectCount = computed(() => {
  return props.sets.reduce((sum, s) => sum + (s.projectCount || 0), 0);
});

function openAdd() {
  dialogMode.value = "add";
  editTargetId.value = null;
  setForm.name = "";
  dialogShow.value = true;
  formRef.value?.clearValidate();
}

function startEdit(s) {
  dialogMode.value = "edit";
  editTargetId.value = s.id;
  setForm.name = s.name;
  dialogShow.value = true;
  formRef.value?.clearValidate();
}

async function doSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  const name = setForm.name.trim();
  // 前端唯一性校验（后端会双重校验，但避免无意义请求）
  if (dialogMode.value === "add") {
    if (props.sets.some((s) => s.name.trim() === name)) {
      return toast(`项目集名称「${name}」已存在`, "error");
    }
  } else {
    if (props.sets.some((s) => s.id !== editTargetId.value && s.name.trim() === name)) {
      return toast(`项目集名称「${name}」已被其他项目集使用`, "error");
    }
  }
  saving.value = true;
  try {
    if (dialogMode.value === "add") {
      const res = await api("api/project-sets", { method: "POST", body: JSON.stringify({ name }), silent: true });
      if (res.ok) { toast("已创建"); dialogShow.value = false; emit("changed"); }
      else toast(res.error || "创建失败", "error");
    } else {
      const res = await api(`api/project-sets/${editTargetId.value}`, { method: "PUT", body: JSON.stringify({ name }), silent: true });
      if (res.ok) { toast("已更新"); dialogShow.value = false; emit("changed"); }
      else toast(res.error || "更新失败", "error");
    }
  } finally {
    saving.value = false;
  }
}

function startDelete(s) {
  if (s.projectCount > 0) {
    toast(`"${s.name}"下还有 ${s.projectCount} 个项目，无法删除`, "error");
    return;
  }
  emit("confirm-ask", { message: `确认删除项目集「${s.name}」？`, action: "delete-set", payload: s.id });
}
</script>

<style scoped>
.set-panel {
  flex-shrink: 0;
  width: 260px;
  overflow-y: auto;
  background: var(--bg-card);
  padding: 20px 16px 20px 14px;
  border-right: 1px solid var(--border-light);
}

/* header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
  padding: 0 4px 14px;
  border-bottom: 1px solid var(--border-light);
}
.header-main { display: flex; align-items: baseline; gap: 8px; }
.header-main h2 {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 0;
}
.header-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
}
.header-actions {
  display: flex;
  gap: 6px;
}

/* buttons */
.search-toggle,
.add-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 7px;
  cursor: pointer;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease-out;
}
.search-toggle:hover,
.add-btn:hover { background: #f3f4f6; color: #111827; border-color: #d1d5db; }
.search-toggle.active { background: #f3f4f6; color: #111827; }

/* search */
.search-area {
  position: relative;
  margin-bottom: 12px;
  padding: 0 4px;
}
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 7px 10px 7px 30px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  font-size: 12px;
  background: #ffffff;
  color: #1f2937;
  outline: none;
  transition: all 0.15s ease-out;
}
.search-input:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.06); }
.search-input::placeholder { color: #9ca3af; }

.search-enter-active, .search-leave-active { transition: all 0.2s ease-out; }
.search-enter-from, .search-leave-to { opacity: 0; transform: translateY(-4px); }

/* all card */
.all-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  position: relative;
  margin: 0 4px 2px;
}
.all-card:hover { background: var(--bg-hover); }
.all-card.active {
  background: var(--bg-hover);
  color: var(--text);
}
.all-card.active .all-icon { color: var(--text); background: transparent; }
.all-card.active .all-name { color: var(--text); }
.all-card.active .all-meta { color: var(--text-secondary); }
.all-icon {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.all-text { flex: 1; min-width: 0; }
.all-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.all-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 12px 8px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #f3f4f6;
}

.empty-state {
  padding: 16px 8px;
  color: #9ca3af;
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.dropdown-danger { color: #dc2626 !important; }
.dropdown-danger:hover { background: #fef2f2 !important; }
</style>
