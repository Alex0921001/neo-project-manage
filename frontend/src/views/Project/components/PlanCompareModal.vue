<template>
  <FloatPanel
    :model-value="show"
    @update:model-value="emit('update:show', $event)"
    title="方案对比"
    :default-width="1100"
    :default-height="640"
    :min-width="800"
    :min-height="440"
  >
    <div class="cmp-wrap">
      <div class="cmp-grid">
        <div v-for="(p, idx) in plans" :key="p.id" class="cmp-col">
          <div class="cmp-col-head">
            <span class="cmp-col-title" :title="p.title">{{ p.title }}</span>
            <span :class="['plan-st', `plan-st-${planStatusKey(p.status)}`]">{{ p.status }}</span>
            <span class="cmp-col-meta">评论 {{ p.commentCount || 0 }}</span>
          </div>
          <div class="cmp-col-body">
            <template v-if="diff">
              <template v-for="(seg, i) in diffSide(idx)" :key="i">
                <span
                  v-if="seg.type === 'del'"
                  class="cmp-del"
                >{{ seg.text }}</span>
                <span
                  v-else-if="seg.type === 'add'"
                  class="cmp-add"
                >{{ seg.text }}</span>
                <span v-else class="cmp-same">{{ seg.text }}</span>
              </template>
            </template>
            <div v-else class="cmp-empty">无内容</div>
          </div>
        </div>
      </div>
      <div class="cmp-foot">
        <span class="cmp-note">逐句对比：仅当两方案完全相同的句子才视为相同，其余按增删标记</span>
        <div class="cmp-legend">
          <span class="cmp-legend-item"><span class="cmp-chip cmp-del"></span>删除</span>
          <span class="cmp-legend-item"><span class="cmp-chip cmp-add"></span>新增</span>
        </div>
      </div>
    </div>
  </FloatPanel>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import { sentenceDiff, stripHtml } from "../../../utils/sentenceDiff.js";
import { planStatusKey } from "../../../utils/planStatus.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  plans: { type: Array, default: () => [] }, // 2 个方案
});
const emit = defineEmits(["close", "update:show"]);

const diff = ref(null);

watch(() => [props.show, props.plans], () => {
  if (!props.show || props.plans.length < 2) {
    diff.value = null;
    return;
  }
  const [a, b] = props.plans;
  diff.value = sentenceDiff(stripHtml(a.content), stripHtml(b.content));
}, { deep: true });

function diffSide(idx) {
  if (!diff.value) return [];
  // 左（A）：same + del；右（B）：same + add
  return idx === 0 ? diff.value.left : diff.value.right;
}
</script>

<style scoped>
.cmp-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 4px 16px 16px;
}
.cmp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
}
.cmp-col {
  display: flex;
  flex-direction: column;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  min-width: 0;
  min-height: 0;
}
.cmp-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--border);
}
.cmp-col-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmp-col-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.cmp-col-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
  word-break: break-word;
}
.cmp-same {
  color: var(--text);
}
.cmp-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: 24px 0;
}
.cmp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 0.5px solid var(--border);
}
.cmp-note {
  font-size: 11px;
  color: var(--text-tertiary);
}
.cmp-legend {
  display: flex;
  gap: 14px;
  flex-shrink: 0;
}
.cmp-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-tertiary);
}
/* 图例色块 / diff 内容高亮（删除划线 + 新增底色） */
.cmp-chip {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
.cmp-del {
  background: oklch(0.94 0.04 25);
  color: var(--status-delay-text);
  text-decoration: line-through;
}
.cmp-add {
  background: oklch(0.95 0.05 162);
  color: var(--status-done-text);
}
/* 方案状态标签（与 PlanModal/PlanTab 一致） */
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
