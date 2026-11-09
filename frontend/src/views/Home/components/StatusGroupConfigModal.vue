<template>
  <FloatPanel
    :model-value="show"
    @update:model-value="emit('update:show', $event)"
    title="状态分组配置"
    :default-width="560"
    :default-height="500"
    :min-width="480"
    :min-height="380"
  >
    <div class="sg-body">
      <div class="sg-tip">拖动右侧手柄调整顺序，改动立即生效并自动保存。</div>

      <draggable
        v-model="local.order"
        item-key="name"
        handle=".sg-drag"
        ghost-class="sg-ghost"
        :animation="150"
        :force-fallback="true"
        fallback-on-body
        fallback-tolerance="8"
        class="sg-list"
        @end="commit"
      >
        <template #item="{ element: name }">
          <div class="sg-row">
            <span class="sg-drag" title="拖动排序">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="9" cy="6" r="1.6" />
                <circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" />
                <circle cx="15" cy="18" r="1.6" />
              </svg>
            </span>

            <div class="sg-name">{{ name }}</div>

            <label class="sg-switch" :title="local.visible[name] ? '显示' : '隐藏'">
              <input
                type="checkbox"
                :checked="local.visible[name]"
                @change="toggleVisible(name, $event)"
              />
              <span class="sg-switch-track"></span>
            </label>

            <select
              class="sg-select"
              :value="local.limit[name]"
              :disabled="!local.visible[name]"
              @change="setLimit(name, $event)"
            >
              <option :value="5">5</option>
              <option :value="10">10</option>
              <option :value="15">15</option>
              <option :value="20">20</option>
              <option value="all">全部</option>
            </select>
          </div>
        </template>
      </draggable>

      <div class="sg-footer">
        <button class="sg-btn" @click="resetDefault">恢复默认</button>
        <button class="sg-btn sg-btn-primary" @click="emit('update:show', false)">关闭</button>
      </div>
    </div>
  </FloatPanel>
</template>

<script setup>
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import FloatPanel from "../../../components/FloatPanel.vue";

/** 分组键固定 7 个：已延期不占键，随「待开始」组展示与计数 */
const GROUP_NAMES = ["预开始", "待开始", "进行中", "预结束", "已完成", "已取消", "已归档"];
const ARCHIVED = "已归档";

const props = defineProps({
  show: { type: Boolean, default: false },
  config: { type: Object, default: null },
});
const emit = defineEmits(["update:show", "change"]);

function buildDefault() {
  const visible = {};
  const limit = {};
  for (const k of GROUP_NAMES) {
    visible[k] = k !== ARCHIVED;
    limit[k] = k === ARCHIVED ? 5 : "all";
  }
  return { order: [...GROUP_NAMES], visible, limit };
}

function normalize(cfg) {
  const def = buildDefault();
  if (!cfg || typeof cfg !== "object") return def;
  const seen = new Set();
  const order = [];
  if (Array.isArray(cfg.order)) {
    for (const k of cfg.order) {
      if (GROUP_NAMES.includes(k) && !seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  for (const k of GROUP_NAMES) if (!seen.has(k)) order.push(k);

  const visible = {};
  const limit = {};
  for (const k of GROUP_NAMES) {
    visible[k] = typeof cfg.visible?.[k] === "boolean" ? cfg.visible[k] : def.visible[k];
    const l = cfg.limit?.[k];
    limit[k] = l === "all" || [5, 10, 15, 20].includes(l) ? l : def.limit[k];
  }
  return { order, visible, limit };
}

const local = ref(normalize(props.config));

watch(
  () => props.config,
  (cfg) => {
    if (cfg) local.value = normalize(cfg);
  },
  { immediate: true }
);

function commit() {
  emit("change", {
    order: [...local.value.order],
    visible: { ...local.value.visible },
    limit: { ...local.value.limit },
  });
}

function toggleVisible(name, event) {
  local.value.visible[name] = !!event.target.checked;
  commit();
}

function setLimit(name, event) {
  const raw = event.target.value;
  local.value.limit[name] = raw === "all" ? "all" : Number(raw);
  commit();
}

function resetDefault() {
  local.value = buildDefault();
  commit();
}
</script>

<style scoped>
.sg-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 18px;
  gap: 12px;
}

.sg-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.sg-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 -6px;
  padding: 0 6px;
}

.sg-row {
  display: grid;
  grid-template-columns: 24px 1fr 44px 84px;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  transition: background 0.15s var(--ease-out, ease);
}

.sg-row:hover {
  background: var(--bg-hover, oklch(0 0 0 / 0.035));
}

/* 拖动后原位置的占位块 */
.sg-ghost {
  opacity: 0.4;
}

.sg-drag {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-tertiary);
  cursor: grab;
  transition: color 0.15s var(--ease-out, ease);
}

.sg-drag:hover {
  color: var(--text-secondary);
}

.sg-drag:active {
  cursor: grabbing;
}

.sg-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  user-select: none;
}

.sg-switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 19px;
  cursor: pointer;
}

.sg-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.sg-switch-track {
  position: absolute;
  inset: 0;
  background: oklch(0 0 0 / 0.14);
  border-radius: 999px;
  transition: background 0.18s var(--ease-out, ease);
}

.sg-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--bg-card, #fff);
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.18);
  transition: transform 0.18s var(--ease-out, ease);
}

.sg-switch input:checked + .sg-switch-track {
  background: var(--accent, oklch(0.62 0.21 255));
}

.sg-switch input:checked + .sg-switch-track::after {
  transform: translateX(15px);
}

.sg-select {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.sg-select:disabled {
  opacity: 0.4;
  cursor: default;
}

.sg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.sg-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s var(--ease-out, ease);
}

.sg-btn:hover {
  border-color: var(--text-secondary);
}

.sg-btn-primary {
  background: var(--accent, oklch(0.62 0.21 255));
  border-color: transparent;
  color: #fff;
}

.sg-btn-primary:hover {
  opacity: 0.9;
}
</style>
