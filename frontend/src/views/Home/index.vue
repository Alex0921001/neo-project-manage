<template>
  <div class="home-wrap">
    <ProjectSetPanel
      :sets="sets"
      :selected-id="selSetId"
      :style="{ width: leftWidth + 'px' }"
      @select-set="onSelectSet"
      @changed="load"
      @confirm-ask="onConfirm"
    />
    <div class="panel-divider" @mousedown.prevent="startResize"></div>
    <ProjectPanel
      ref="projPanel"
      :sets="sets"
      :refresh-key="refreshKey"
      @open-project="$emit('open-project', $event)"
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
import ProjectSetPanel from "./components/ProjectSetPanel.vue";
import ProjectPanel from "./components/ProjectPanel.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";

const emit = defineEmits(["open-project"]);

// ===== Resizable =====
const leftWidth = ref(270);
const refreshKey = ref(0);
let resizing = false;
const STATE_KEY = "neo-pm-home";
function saveState(k, v) {
  try { const s = JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); s[k] = v; localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} 
}
function startResize(e) {
  resizing = true;
  document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  const startX = e.clientX, startW = leftWidth.value;
  function onMove(ev) {
    if (!resizing) return;
    leftWidth.value = Math.max(180, Math.min(450, startW + ev.clientX - startX));
  }
  function onUp() {
    resizing = false;
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
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
    if (res.ok) { toast("已删除"); load(); }
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
    if (s.leftWidth) leftWidth.value = s.leftWidth;
    if (s.selSetId !== undefined) {
      selSetId.value = s.selSetId;
      projPanel.value?.setFilter(s.selSetId);
    }
  } catch {}
});

watch(leftWidth, (v) => saveState("leftWidth", v));
watch(selSetId, (v) => saveState("selSetId", v));

defineExpose({ refresh });
</script>

<style scoped>
.home-wrap { display: flex; flex: 1; min-height: 0; }
.panel-divider {
  width: 4px; flex-shrink: 0; cursor: col-resize;
  background: var(--border-light); position: relative; z-index: 10;
  transition: background var(--duration-fast) var(--ease-out);
}
.panel-divider:hover, .panel-divider:active { background: var(--accent); }
</style>
