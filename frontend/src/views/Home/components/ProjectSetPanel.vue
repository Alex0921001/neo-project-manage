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
        <button class="add-btn" @click="showAddForm = true" title="新建项目集">
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
      v-for="s in filteredSets"
      :key="s.id"
      :set="s"
      :is-active="s.id === selectedId"
      @select="$emit('select-set', s.id)"
      @edit="startEdit"
      @delete="startDelete"
    />

    <!-- Add Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal">
        <h3>新建项目集</h3>
        <label>名称</label>
        <input v-model="addName" type="text" maxlength="10" placeholder="最多10字" @keyup.enter="doAdd">
        <div class="modal-actions">
          <button class="btn-secondary" @click="showAddForm = false">取消</button>
          <button class="btn-primary" @click="doAdd">创建</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editTarget" class="modal-overlay" @click.self="editTarget = null">
      <div class="modal">
        <h3>编辑项目集</h3>
        <label>名称</label>
        <input v-model="editTarget.name" type="text" maxlength="10" @keyup.enter="doEdit">
        <div class="modal-actions">
          <button class="btn-secondary" @click="editTarget = null">取消</button>
          <button class="btn-primary" @click="doEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
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

const totalProjectCount = computed(() => {
  return props.sets.reduce((sum, s) => sum + (s.projectCount || 0), 0);
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
.set-panel {
  flex-shrink: 0;
  width: 260px;
  overflow-y: auto;
  background: #ffffff;
  padding: 20px 16px 20px 14px;
  border-right: 1px solid #e5e7eb;
}

/* header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
  padding: 0 4px 14px;
  border-bottom: 1px solid #e5e7eb;
}
.header-main { display: flex; align-items: baseline; gap: 8px; }
.header-main h2 {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
  margin: 0;
}
.header-sub {
  font-size: 11px;
  color: #9ca3af;
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
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.15s ease-out;
  position: relative;
  margin: 0 4px 4px;
}
.all-card:hover { background: #f3f4f6; }
.all-card.active {
  background: #111827;
  border-color: #111827;
}
.all-card.active .all-icon { background: rgba(255,255,255,0.15); color: #ffffff; }
.all-card.active .all-name { color: #ffffff; }
.all-card.active .all-meta { color: rgba(255,255,255,0.55); }
.all-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #f3f4f6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  flex-shrink: 0;
  transition: all 0.15s ease-out;
}
.all-text { flex: 1; min-width: 0; }
.all-name {
  font-weight: 600;
  font-size: 13px;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.all-meta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 12px 8px;
  font-size: 10px;
  font-weight: 700;
  color: #9ca3af;
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

/* modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease-out;
}
.modal {
  background: #ffffff;
  padding: 24px;
  border-radius: 14px;
  width: 360px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.20), 0 4px 12px rgba(0, 0, 0, 0.10);
  animation: rise 0.2s ease-out;
}
.modal h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.01em;
}
.modal label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.modal input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  background: #ffffff;
  color: #1f2937;
  outline: none;
  transition: all 0.15s ease-out;
  box-sizing: border-box;
}
.modal input:focus { border-color: #111827; box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.06); }
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.btn-secondary {
  padding: 7px 14px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #6b7280;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-out;
}
.btn-secondary:hover { background: #f3f4f6; color: #1f2937; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes rise {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.dropdown-danger { color: #dc2626 !important; }
.dropdown-danger:hover { background: #fef2f2 !important; }
</style>
