<template>
  <FloatPanel
    :model-value="modelValue"
    title="项目集"
    :default-width="640"
    :default-height="480"
    :min-width="480"
    :min-height="360"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('update:modelValue', false)"
  >
    <div class="set-panel">
      <!-- header：搜索 + 新建 -->
      <div class="panel-header">
        <div class="search-area">
          <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
          <input v-model="search" class="search-input" placeholder="搜索项目集..." />
          <button v-if="search" class="search-clear" @click="search = ''">×</button>
        </div>
        <button class="add-btn" @click="openAdd">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建项目集
        </button>
      </div>

      <!-- 全部项目卡片 -->
      <div class="set-grid">
        <div class="square-card all-card" :class="{ active: selectedId === null }" @click="select(null)">
          <div class="square-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <div class="square-name">全部项目</div>
          <div class="square-meta">{{ totalProjectCount }} 个项目</div>
        </div>

        <div v-if="filteredSets.length === 0 && search" class="empty-state">暂无匹配</div>
        <div
          v-for="s in filteredSets"
          :key="s.id"
          class="square-card"
          :class="{ active: s.id === selectedId }"
          @click="select(s.id)"
        >
          <div class="square-color" :style="{ background: pickPaletteColor(sets.indexOf(s)) }"></div>
          <div class="square-name">{{ s.name }}</div>
          <div class="square-meta">{{ s.projectCount }} 个项目</div>
          <div class="square-actions" @click.stop>
            <button title="编辑" @click="startEdit(s)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button title="删除" class="danger" @click="startDelete(s)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建/编辑项目集（公共 FormDialog：可拖拽/缩放/双击全屏） -->
    <FormDialog
      v-model:show="dialogShow"
      :title="dialogMode === 'add' ? '新建项目集' : '编辑项目集'"
      :width="420"
      :height="260"
      :form="setForm"
      :rules="rules"
      :saving="saving"
      :save-text="dialogMode === 'add' ? '创建' : '保存'"
      @update:show="(v) => { if (!v) dialogShow = false }"
      @cancel="dialogShow = false"
      @save="doSave"
    >
      <el-form-item label="名称" prop="name">
        <el-input v-model="setForm.name" maxlength="10" show-word-limit placeholder="最多10字" @keyup.enter="doSave" />
      </el-form-item>
    </FormDialog>
  </FloatPanel>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { pickPaletteColor } from "../../../utils/palette.js";
import FormDialog from "../../../components/FormDialog.vue";
import FloatPanel from "../../../components/FloatPanel.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  sets: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
});
const emit = defineEmits(["update:modelValue", "select-set", "changed", "confirm-ask"]);

const search = ref("");
const dialogShow = ref(false);
const dialogMode = ref("add");
const editTargetId = ref(null);
const saving = ref(false);
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

function select(id) {
  emit("select-set", id);
  emit("update:modelValue", false);
}

function openAdd() {
  dialogMode.value = "add";
  editTargetId.value = null;
  setForm.name = "";
  dialogShow.value = true;
}

function startEdit(s) {
  dialogMode.value = "edit";
  editTargetId.value = s.id;
  setForm.name = s.name;
  dialogShow.value = true;
}

async function doSave() {
  const name = setForm.name.trim();
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
  min-height: 200px;
  padding: 14px 16px;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.search-area {
  flex: 1;
  position: relative;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 7px 28px 7px 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.search-input:focus { border-color: var(--accent); }
.search-input::placeholder { color: var(--text-tertiary); }
.search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.search-clear:hover { background: var(--bg-hover); color: var(--text); }

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.add-btn:hover { background: var(--bg-hover); border-color: var(--border); }

/* 方形卡片网格 */
.set-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.square-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 12px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  cursor: pointer;
  text-align: center;
  transition: all var(--duration-fast) var(--ease-out);
  position: relative;
}
.square-card:hover { border-color: var(--border); background: var(--bg-hover); }
.square-card.active {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

.square-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
.square-card.active .square-icon { color: var(--accent); background: var(--accent-subtle); }

.square-color {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.square-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.square-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.square-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.square-card:hover .square-actions { opacity: 1; }
.square-actions button {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease-out);
}
.square-actions button:hover { background: var(--bg-hover); color: var(--text); }
.square-actions button.danger:hover { background: #fdecec; color: var(--danger); }

.empty-state {
  grid-column: 1 / -1;
  padding: 32px 8px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12.5px;
}
</style>