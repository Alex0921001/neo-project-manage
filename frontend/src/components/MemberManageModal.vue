<template>
  <el-dialog
    :model-value="show"
    title="人员管理"
    width="480px"
    :close-on-click-modal="false"
    append-to-body
    @close="emit('close')"
  >
    <div class="member-manage">
      <!-- 顶部搜索 -->
      <el-input
        v-model="keyword"
        placeholder="搜索成员"
        clearable
        class="member-search"
      />

      <!-- 成员列表：点击行进入编辑（回车保存），右侧 × 删除（不二次确认） -->
      <div class="member-list">
        <div
          v-for="m in filteredMembers"
          :key="m.id"
          class="member-row"
          @click="startEdit(m)"
        >
          <input
            v-if="editingId === m.id"
            v-model="editingName"
            class="member-row-input"
            :data-mid="m.id"
            maxlength="50"
            @click.stop
            @keydown.enter.prevent="saveEdit(m)"
            @keydown.escape.prevent="cancelEdit()"
            @blur="saveEdit(m)"
          />
          <span v-else class="member-row-name">{{ m.name }}</span>
          <button
            class="member-row-del"
            title="删除"
            @mousedown.prevent
            @click.stop="removeMember(m)"
          >×</button>
        </div>
        <div v-if="!filteredMembers.length" class="member-empty">
          暂无成员，输入人名回车添加
        </div>
      </div>

      <!-- 底部固定：输入人名回车立即添加 -->
      <div class="member-add">
        <el-input
          v-model="newName"
          placeholder="输入人名，回车添加"
          maxlength="50"
          @keydown.enter.prevent="addMember"
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { api } from "../api.js";
import { toast } from "../toast.js";

const props = defineProps({ show: Boolean });
const emit = defineEmits(["close", "changed"]);

const members = ref([]);
const keyword = ref("");
const newName = ref("");
const editingId = ref("");
const editingName = ref("");
const editInputs = ref([]);

const filteredMembers = computed(() => {
  const q = keyword.value.trim();
  if (!q) return members.value;
  return members.value.filter((m) => m.name.includes(q));
});

async function load() {
  const res = await api("api/members");
  if (res?.ok && Array.isArray(res.data)) members.value = res.data;
}

watch(() => props.show, (v) => {
  if (v) { load(); keyword.value = ""; newName.value = ""; editingId.value = ""; }
});

// ===== 添加（回车，重复名由后端拦截提示）=====
async function addMember() {
  const name = newName.value.trim();
  if (!name) return;
  const res = await api("api/members", { method: "POST", body: JSON.stringify({ name }) });
  if (res?.ok) {
    newName.value = "";
    await load();
    emit("changed");
  }
}

// ===== 行内编辑 =====
function startEdit(m) {
  editingId.value = m.id;
  editingName.value = m.name;
  nextTick(() => {
    const el = editInputs.value.find((i) => i?.dataset?.mid === m.id);
    el?.focus();
    el?.select();
  });
}

function cancelEdit() {
  editingId.value = "";
  editingName.value = "";
}

async function saveEdit(m) {
  const name = editingName.value.trim();
  const curId = editingId.value;
  editingId.value = ""; // 先退出编辑态，避免 blur 重复触发
  if (curId !== m.id) return;
  if (!name || name === m.name) return;
  const res = await api(`api/members/${m.id}`, { method: "PUT", body: JSON.stringify({ name }) });
  if (res?.ok) {
    toast("已更新");
    await load();
    emit("changed");
  }
}

// ===== 删除（不二次确认）=====
async function removeMember(m) {
  const res = await api(`api/members/${m.id}`, { method: "DELETE" });
  if (res?.ok) {
    toast("已删除");
    await load();
    emit("changed");
  }
}
</script>

<style scoped>
.member-manage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-search {
  flex-shrink: 0;
}

/* 列表：最大高度 + 滚动 */
.member-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 一行一个，灰色底色，点击进入编辑 */
.member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-hover);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.member-row:hover {
  background: var(--bg-card);
  box-shadow: inset 0 0 0 1px var(--border-light);
}

.member-row-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行内编辑输入框 */
.member-row-input {
  flex: 1;
  min-width: 0;
  font-family: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  outline: none;
}

.member-row-del {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  color: var(--text-tertiary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.member-row-del:hover {
  color: var(--danger);
  background: var(--bg-danger-subtle, var(--bg-hover));
}

.member-empty {
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 底部添加行 */
.member-add {
  flex-shrink: 0;
}
</style>
