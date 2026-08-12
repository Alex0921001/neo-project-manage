<template>
  <div class="plan-tab">
    <div class="plan-head">
      <span class="plan-head-title">方案</span>
      <div class="plan-head-actions">
        <button
          class="header-btn"
          :disabled="selectedCount < 2"
          :title="selectedCount < 2 ? '勾选 2 个方案后对比' : '对比选中的 2 个方案'"
          @click="openCompare"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          对比选中{{ selectedCount > 0 ? `（${selectedCount}/2）` : "" }}
        </button>
        <button class="header-btn header-btn-primary" @click="openCreate">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建方案
        </button>
      </div>
    </div>

    <div v-if="loading" class="plan-empty">加载中…</div>
    <div v-else-if="plans.length === 0" class="plan-empty">
      暂无方案，点击「新建方案」记录第一个选型对比
    </div>
    <div v-else class="plan-list">
      <div
        v-for="pl in plans"
        :key="pl.id"
        class="plan-row"
        :class="{ 'plan-row-selected': selected.has(pl.id) }"
        @click="openDetail(pl)"
      >
        <span
          class="plan-row-check"
          :class="{ checked: selected.has(pl.id) }"
          title="勾选用于对比"
          @click.stop="toggleSelect(pl.id)"
        >
          <svg v-if="selected.has(pl.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="plan-row-title" :title="pl.title">{{ pl.title }}</span>
        <span :class="['plan-st', `plan-st-${planStatusKey(pl.status)}`]">{{ pl.status }}</span>
        <span v-if="pl.commentCount" class="plan-row-meta">评论 {{ pl.commentCount }}</span>
        <span v-if="pl.taskName" class="plan-row-task" @click.stop="jumpTask(pl.taskId)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          已转任务
        </span>
      </div>
    </div>

    <PlanModal
      v-model:show="modal.show"
      :project-id="projectId"
      :plan-id="modal.planId"
      :mode="modal.mode"
      @mode-change="modal.mode = $event"
      @close="modal.show = false"
      @changed="load"
      @jump-task="jumpTask"
    />
    <PlanCompareModal v-model:show="compareShow" :plans="comparePlans" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";
import { planStatusKey } from "../../../utils/planStatus.js";
import PlanModal from "./PlanModal.vue";
import PlanCompareModal from "./PlanCompareModal.vue";

const props = defineProps({
  projectId: { type: String, default: "" },
});
const emit = defineEmits(["changed", "jump-task"]);

const plans = ref([]);
const loading = ref(false);
const selected = ref(new Set());
const modal = ref({ show: false, planId: null, mode: "read" });
const compareShow = ref(false);

const selectedCount = computed(() => selected.value.size);
const comparePlans = computed(() => plans.value.filter((p) => selected.value.has(p.id)).slice(0, 2));

async function load() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const res = await api(`api/projects/${props.projectId}/plans`);
    if (res?.ok) {
      plans.value = res.data;
      // 清理已不存在的勾选
      const ids = new Set(res.data.map((p) => p.id));
      selected.value = new Set([...selected.value].filter((id) => ids.has(id)));
    } else {
      toast(res?.error || "加载方案失败", "error");
    }
  } finally {
    loading.value = false;
  }
}

function toggleSelect(id) {
  const next = new Set(selected.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    if (next.size >= 2) return toast("对比最多选 2 个方案", "error");
    next.add(id);
  }
  selected.value = next;
}

function openDetail(pl) {
  modal.value = { show: true, planId: pl.id, mode: "read" };
}
function openCreate() {
  modal.value = { show: true, planId: null, mode: "edit" };
}
function openCompare() {
  if (selectedCount.value < 2) return toast("请先勾选 2 个方案", "error");
  compareShow.value = true;
}
function jumpTask(taskId) {
  emit("jump-task", taskId);
}

watch(() => props.projectId, () => load(), { immediate: true });
</script>

<style scoped>
.plan-tab {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.plan-head-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.plan-head-actions {
  display: flex;
  gap: 8px;
}
.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0.5px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.header-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}
.header-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.header-btn-primary {
  border-color: transparent;
  background: var(--accent-warm);
  color: #fff;
}
.header-btn-primary:hover:not(:disabled) {
  background: var(--accent-warm-hover);
}
.plan-empty {
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
  padding: 36px 0;
}
.plan-list {
  display: flex;
  flex-direction: column;
}
.plan-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--border);
  cursor: pointer;
  border-radius: 6px;
}
.plan-row:hover {
  background: var(--bg-hover);
}
.plan-row-selected {
  background: var(--accent-warm-subtle);
}
.plan-row-check {
  width: 16px;
  height: 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  background: transparent;
}
.plan-row-check.checked {
  background: var(--accent-warm);
  border-color: var(--accent-warm);
}
.plan-row-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-row-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.plan-row-task {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--status-done-text);
  flex-shrink: 0;
}
.plan-row-task:hover {
  text-decoration: underline;
}
/* 方案状态标签 */
.plan-st {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  flex-shrink: 0;
}
.plan-st-draft { color: var(--text-tertiary); background: oklch(0.94 0.005 80); }
.plan-st-doing { color: var(--status-doing-text); background: oklch(0.95 0.03 255); }
.plan-st-done { color: var(--status-done-text); background: oklch(0.95 0.04 162); }
.plan-st-abandoned { color: var(--status-delay-text); background: oklch(0.95 0.03 25); }
</style>
