<template>
  <div class="home-wrap">
    <ProjectSetTabs
      :sets="sets"
      :selected-id="selSetId"
      @select-set="onSelectSet"
      @changed="load"
      @confirm-ask="onConfirm"
      @reorder="onReorder"
    />
    <ProjectPanel
      ref="projPanel"
      :sets="sets"
      :refresh-key="refreshKey"
      @open-project="$emit('open-project', $event)"
      @go-calendar="() => $emit('go-calendar', selSetId)"
      @changed="load"
      @confirm-ask="onConfirm"
    />

    <ConfirmModal
      :show="confirm.show"
      :message="confirm.message"
      :confirm-text="confirm.text"
      @close="confirm.show = false"
      @confirm="doConfirm"
    />

    <!-- 右下角功能速查入口（v2.1.0） -->
    <CapabilityCheatSheet />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { api } from "../../api.js";
import { toast } from "../../toast.js";
import ProjectSetTabs from "./components/ProjectSetTabs.vue";
import ProjectPanel from "./components/ProjectPanel.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";
import CapabilityCheatSheet from "../../components/CapabilityCheatSheet.vue";

const emit = defineEmits(["open-project", "go-calendar"]);

// ===== State =====
const refreshKey = ref(0);
const STATE_KEY = "neo-pm-home";
function saveState(k, v) {
  try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); s[k] = v; localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} 
}

// ===== Data =====
const sets = ref([]);
const selSetId = ref(null);
const projPanel = ref(null);

async function load() {
  const res = await api("api/project-sets");
  if (res && res.ok) sets.value = res.data || [];
}

async function refresh() {
  refreshKey.value++;
  await load();
  projPanel.value?.load();
}

function onSelectSet(id) {
  selSetId.value = id;
  projPanel.value?.setFilter(id);
}

// tabs 拖拽/弹窗排序：按新顺序重排 sets，并持久化到后端（v1.3.1）
async function onReorder(ids) {
  const map = new Map(sets.value.map((s) => [s.id, s]));
  sets.value = ids.map((id) => map.get(id)).filter(Boolean);
  const res = await api("api/project-sets/reorder", { method: "POST", body: JSON.stringify({ ids }), silent: true });
  if (res?.ok) {
    load(); // 刷新拿到后端最新 sort，保持顺序
  } else {
    toast(res?.error || "排序保存失败", "error");
    load(); // 失败回滚到后端顺序
  }
}

// ===== Confirm =====
const confirm = ref({ show: false, message: "", text: "确认删除", action: "", payload: null });
function onConfirm(e) {
  confirm.value = { show: true, message: e.message, text: e.confirmText || "确认删除", action: e.action, payload: e.payload };
}
async function doConfirm() {
  const { action, payload } = confirm.value;
  confirm.value.show = false;
  if (action === "delete-set") {
    const res = await api(`api/project-sets/${payload}`, { method: "DELETE", silent: true });
    if (res.ok) { toast("已删除"); if (selSetId.value === payload) { selSetId.value = null; projPanel.value?.setFilter(null); } load(); }
    else toast(res.error || "删除失败", "error");  // 重复 toast 被 toast.js 内容去重
  } else if (action === "delete-project") {
    const res = await api(`api/projects/${payload}`, { method: "DELETE", silent: true });
    if (res.ok) { toast("已删除"); load(); projPanel.value?.load(); }
    else toast(res.error || "删除失败", "error");  // 重复 toast 被 toast.js 内容去重
  } else if (action === "archive-project") {
    const res = await api(`api/projects/${payload}`, { method: "PUT", body: JSON.stringify({ archived: true }), silent: true });
    if (res.ok) { toast("已归档"); load(); projPanel.value?.load(); }
    else toast(res.error || "归档失败", "error");
  }
  confirm.value.action = ""; confirm.value.payload = null;
}

onMounted(async () => {
  await load();
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    if (s.selSetId !== undefined) {
      selSetId.value = s.selSetId;
      projPanel.value?.setFilter(s.selSetId);
    }
  } catch {}
});

watch(selSetId, (v) => saveState("selSetId", v));

defineExpose({ refresh });
</script>

<style scoped>
.home-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; }
</style>
