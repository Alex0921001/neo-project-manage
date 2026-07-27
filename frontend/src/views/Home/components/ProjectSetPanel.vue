<template>
  <div class="set-panel">
    <div class="panel-header">
      <h2>项目集</h2>
      <div class="header-actions">
        <button class="btn-icon" @click="showSearch = !showSearch" title="搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        </button>
        <button class="btn-icon" @click="showAddForm = true">+</button>
      </div>
    </div>
    <div v-if="showSearch" class="search-area">
      <input v-model="search" class="search-input" placeholder="搜索项目集名称...">
    </div>
    <div
      :class="['set-card', 'all-card', { active: selectedId === null }]"
      @click="$emit('select-set', null)"
    >
      <div class="set-header">
        <div class="set-name">全部</div>
      </div>
      <div class="set-meta">{{ sets.length }} 个项目集</div>
    </div>
    <div v-if="filteredSets.length === 0 && search" class="empty-state">暂无匹配</div>
    <SetCard
      v-for="s in filteredSets"
      :key="s.id"
      :set="s"
      :is-active="s.id === selectedId"
      @select="$emit('select-set', s.id)"
      @edit="startEdit"
      @delete="startDelete"
    />

    <!-- Add Modal -->
    <div v-if="showAddForm" class="modal-overlay">
      <div class="modal">
        <h3>新建项目集</h3>
        <label>名称（最多10字）</label>
        <input v-model="addName" type="text" maxlength="10" @keyup.enter="doAdd">
        <div class="modal-actions">
          <button @click="showAddForm = false">取消</button>
          <button class="btn-primary" @click="doAdd">创建</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editTarget" class="modal-overlay">
      <div class="modal">
        <h3>编辑项目集</h3>
        <label>名称（最多10字）</label>
        <input v-model="editTarget.name" type="text" maxlength="10" @keyup.enter="doEdit">
        <div class="modal-actions">
          <button @click="editTarget = null">取消</button>
          <button class="btn-primary" @click="doEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import SetCard from "./SetCard.vue";

const props = defineProps({
  sets: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
});
const emit = defineEmits(["select-set", "changed", "confirm-ask"]);

const search = ref("");
const showSearch = ref(false);
const showAddForm = ref(false);
const addName = ref("");
const editTarget = ref(null);

const filteredSets = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.sets;
  return props.sets.filter((s) => s.name.toLowerCase().includes(q));
});

async function doAdd() {
  const name = addName.value.trim();
  if (!name) return toast("请输入名称", "error");
  const res = await api("api/project-sets", { method: "POST", body: JSON.stringify({ name }) });
  if (res.ok) { toast("已创建"); showAddForm.value = false; addName.value = ""; emit("changed"); }
  else toast(res.error || "创建失败", "error");
}

function startEdit(s) { editTarget.value = { id: s.id, name: s.name }; }
async function doEdit() {
  const d = editTarget.value;
  if (!d || !d.name.trim()) return toast("请输入名称", "error");
  const res = await api(`api/project-sets/${d.id}`, { method: "PUT", body: JSON.stringify({ name: d.name.trim() }) });
  if (res.ok) { toast("已更新"); editTarget.value = null; emit("changed"); }
  else toast(res.error || "更新失败", "error");
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
.all-card { margin-bottom: 6px; border: 1px solid transparent; border-radius: var(--radius-md); padding: 10px 12px; cursor: pointer; transition: all var(--duration-fast) var(--ease-out); position: relative; }
.all-card:hover { background: var(--bg-hover); }
.all-card.active { background: var(--accent-subtle); border-color: var(--accent); }
.all-card.active::before {
  content: ''; position: absolute; left: -16px; top: 50%;
  transform: translateY(-50%); width: 3px; height: 20px;
  background: var(--accent); border-radius: 0 2px 2px 0;
}
.set-panel { flex-shrink: 0; overflow-y: auto; background: var(--bg); padding: 20px 16px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.panel-header h2 { font-size: 15px; font-weight: 600; }
.header-actions { display: flex; gap: 6px; }
.search-area { margin-bottom: 12px; }
.search-input {
  width: 100%; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 13px; background: var(--bg); color: var(--text);
  outline: none; transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-subtle); }
.dropdown-danger { color: oklch(0.5 0.18 30) !important; }
.dropdown-danger:hover { background: oklch(0.93 0.05 30 / 0.3) !important; }
</style>
