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
      @go-calendar="$emit('go-calendar')"
      @changed="load"
      @confirm-ask="onConfirm"
    />

    <ConfirmModal
      :show="confirm.show"
      :message="confirm.message"
      @close="confirm.show = false"
      @confirm="doConfirm"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { api } from "../../api.js";
import { toast } from "../../toast.js";
import ProjectSetTabs from "./components/ProjectSetTabs.vue";
import ProjectPanel from "./components/ProjectPanel.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";

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

// tabs 拖拽/弹窗排序：按新顺序重排 sets（内存态，真实库模式刷新还原）
function onReorder(ids) {
  const map = new Map(sets.value.map((s) => [s.id, s]));
  sets.value = ids.map((id) => map.get(id)).filter(Boolean);
}

// ===== Confirm =====
const confirm = ref({ show: false, message: "", action: "", payload: null });
function onConfirm(e) {
  confirm.value = { show: true, message: e.message, action: e.action, payload: e.payload };
}
async function doConfirm() {
  const { action, payload } = confirm.value;
  confirm.value.show = false;
  if (action === "delete-set") {
    const res = await api(`api/project-sets/${payload}`, { method: "DELETE" });
    if (res.ok) { toast("已删除"); if (selSetId.value === payload) { selSetId.value = null; projPanel.value?.setFilter(null); } load(); }
    else toast(res.error || "删除失败", "error");
  } else if (action === "delete-project") {
    const res = await api(`api/projects/${payload}`, { method: "DELETE" });
    if (res.ok) { toast("已删除"); load(); projPanel.value?.load(); }
    else toast(res.error || "删除失败", "error");
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
