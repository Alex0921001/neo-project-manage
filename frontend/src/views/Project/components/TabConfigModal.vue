<template>
  <div class="tc-mask" @click.self="$emit('cancel')">
    <div class="tc-panel">
      <div class="tc-head">
        <span class="tc-title">Tab 设置</span>
        <span class="tc-scope-tip">{{ scopeTip }}</span>
        <button class="tc-close" @click="$emit('cancel')">×</button>
      </div>

      <div class="tc-body">
        <div class="tc-hint">拖动手柄调整顺序，勾选控制显隐，点击「全局应用」或「本项目应用」后生效</div>
        <draggable
          v-model="localDraft.order"
          item-key="key"
          handle=".tc-drag"
          ghost-class="tc-ghost"
          :animation="150"
          class="tc-list"
        >
          <template #item="{ element: key, index: idx }">
            <div class="tc-row" :class="{ 'tc-row-hidden': localDraft.hidden.includes(key) }">
              <span class="tc-drag" title="拖动排序">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>
              </span>
              <span class="tc-idx">{{ idx + 1 }}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="defSvg(key)"></svg>
              <span class="tc-name">{{ defLabel(key) }}</span>
              <div class="tc-ops">
                <label class="tc-vis">
                  <input type="checkbox" :checked="!localDraft.hidden.includes(key)" @change="toggle(key, $event.target.checked)" />
                  显示
                </label>
              </div>
            </div>
          </template>
        </draggable>
      </div>

      <div class="tc-foot">
        <button class="tc-btn tc-btn-ghost" @click="resetLocal">重置默认</button>
        <div class="tc-foot-spacer"></div>
        <button class="tc-btn" @click="$emit('cancel')">取消</button>
        <button class="tc-btn tc-btn-global" @click="$emit('apply', 'global', localDraft)">全局应用</button>
        <button class="tc-btn tc-btn-primary" @click="$emit('apply', 'project', localDraft)">本项目应用</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import draggable from "vuedraggable";

const props = defineProps({
  defs: { type: Array, required: true },
  draft: { type: Object, required: true }, // { order: [], hidden: [] }
});
const emit = defineEmits(["cancel", "apply"]);

// 弹窗内独立草稿：不实时生效，点应用才 emit
const localDraft = ref({
  order: [...(props.draft?.order || [])],
  hidden: [...(props.draft?.hidden || [])],
});

function resetLocal() {
  localDraft.value = {
    order: props.defs.map((d) => d.key),
    hidden: [],
  };
}

const scopeTip =
  props.draft?.scope === "project"
    ? "当前为本项目配置"
    : props.draft?.scope === "global"
      ? "当前为全局配置"
      : "当前为默认顺序";

function defLabel(key) {
  return props.defs.find((d) => d.key === key)?.label || key;
}
function defSvg(key) {
  return props.defs.find((d) => d.key === key)?.svg || "";
}
function toggle(key, visible) {
  const hidden = new Set(localDraft.value.hidden);
  if (visible) hidden.delete(key);
  else hidden.add(key);
  localDraft.value.hidden = [...hidden];
}
</script>

<style scoped>
.tc-mask {
  position: fixed;
  inset: 0;
  z-index: 3500;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tc-panel {
  width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.tc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
}
.tc-title { font-size: 14px; font-weight: 700; color: var(--text); }
.tc-scope-tip {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 10px;
}
.tc-close {
  margin-left: auto;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--text-tertiary);
  cursor: pointer;
}
.tc-close:hover { color: var(--text); }
.tc-body { padding: 0 16px; overflow-y: auto; }
.tc-hint { font-size: 11px; color: var(--text-tertiary); margin-bottom: 10px; }
.tc-list { display: flex; flex-direction: column; gap: 4px; }
.tc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
}
.tc-row-hidden { opacity: 0.55; background: var(--bg-hover); }
.tc-row-hidden .tc-name { text-decoration: line-through; }
.tc-idx {
  width: 18px;
  text-align: center;
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.tc-name { flex: 1; }
.tc-ops { display: inline-flex; align-items: center; gap: 6px; }
/* 拖拽手柄（vuedraggable handle） */
.tc-drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  cursor: grab;
  padding: 2px;
  border-radius: 4px;
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.tc-drag:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}
.tc-drag:active { cursor: grabbing; }
.tc-ghost { opacity: 0.4; background: var(--bg-hover); }
.tc-vis {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  margin-left: 4px;
}
.tc-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 14px;
}
.tc-foot-spacer { flex: 1; }
.tc-btn {
  padding: 7px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.tc-btn:hover { color: var(--text); background: var(--bg-hover); }
.tc-btn-ghost { border-style: dashed; }
.tc-btn-primary { background: var(--accent); border-color: var(--accent); color: var(--bg-card); }
.tc-btn-primary:hover { opacity: 0.9; color: var(--bg-card); background: var(--accent); }
.tc-btn-global { border-color: var(--border); }
</style>
