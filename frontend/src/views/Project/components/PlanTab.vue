<template>
  <div class="plan-tab">
    <div v-if="loading" class="plans-empty">加载中…</div>
    <div v-else-if="plans.length === 0" class="plans-empty">
      <div class="plans-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 13l2 2 4-4"/></svg>
      </div>
      <p class="plans-empty-title">还没有方案</p>
      <p class="plans-empty-sub">记录方案选型，对比后一键转任务</p>
      <button class="plans-add plans-add-large" @click="openCreate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>添加第一个方案</span>
      </button>
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
          :class="{ checked: selected.has(pl.id), disabled: selectedCount >= 2 && !selected.has(pl.id) }"
          :title="selectedCount >= 2 && !selected.has(pl.id) ? '对比最多选 2 个' : '勾选用于对比'"
          @click.stop="toggleSelect(pl.id)"
        >
          <svg v-if="selected.has(pl.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span class="plan-row-title" :title="pl.title">{{ pl.title }}</span>
        <span :class="['plan-st', `plan-st-${planStatusKey(pl.status)}`]">{{ pl.status }}</span>
        <span class="plan-row-meta">评论 {{ pl.commentCount }}</span>
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
    // 已选满 2 个：其余 checkbox 置灰，点击静默忽略
    if (next.size >= 2) return;
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

// 勾选数上报父级（右上角「对比选中」按钮联动 disabled / 计数）
watch(selected, () => emit("compare-count", selectedCount.value));
function jumpTask(taskId) {
  emit("jump-task", taskId);
}

defineExpose({ openCreate, load, openCompare });

watch(() => props.projectId, () => load(), { immediate: true });
</script>

<style scoped>
.plan-tab {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
/* ===== 空态（对齐备注页） ===== */
.plans-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  gap: 6px;
}
.plans-empty-deco {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.plans-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.plans-empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.plans-add.plans-add-large {
  margin-top: 14px;
  padding: 8px 20px;
  font-size: 13px;
}
.plans-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--text);
  color: var(--bg-card);
  border: 1px solid var(--text);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}
.plans-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
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
.plan-row-check.disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
  width: 56px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary);
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
