<template>
  <FloatPanel
    :model-value="show"
    @update:model-value="emit('update:show', $event)"
    title="风险规则配置"
    :default-width="640"
    :default-height="560"
    :min-width="520"
    :min-height="420"
  >
    <div class="rc-body">
      <div class="rc-tip">规则按顺序展示，关闭后该项不再产生风险提示；等级影响概览页风险条目的排序与颜色。</div>

      <div v-if="loading" class="rc-loading">加载中...</div>

      <template v-else-if="rules">
        <div class="rc-list">
          <template v-for="group in groupedRules" :key="group.label">
            <div class="rc-group">{{ group.label }}</div>
            <div v-for="item in group.items" :key="item.key" class="rc-row">
          <div class="rc-row-main">
            <label class="rc-switch">
              <input type="checkbox" v-model="item.rule.enabled" />
              <span class="rc-switch-track"></span>
            </label>
            <div class="rc-row-info">
              <div class="rc-row-name">{{ item.name }}</div>
              <div class="rc-row-desc">{{ item.desc }}</div>
            </div>
          </div>
          <div class="rc-row-ctrls">
            <!-- 数字参数 -->
            <template v-for="num in item.nums" :key="num.field">
              <div class="rc-num">
                <span class="rc-num-label">{{ num.label }}</span>
                <input
                  type="number"
                  class="rc-input"
                  :value="item.rule[num.field]"
                  :disabled="!item.rule.enabled"
                  :min="num.min"
                  :max="num.max"
                  @change="onNumChange(item.rule, num, $event)"
                />
              </div>
            </template>
            <!-- 等级参数 -->
            <template v-for="lv in item.levels" :key="lv.field">
              <div class="rc-num">
                <span class="rc-num-label">{{ lv.label }}</span>
                <select class="rc-select" v-model="item.rule[lv.field]" :disabled="!item.rule.enabled">
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
            </template>
          </div>
        </div>
        </template>
      </div>
      </template>

      <div class="rc-footer">
        <button class="rc-btn" @click="resetDefault">恢复默认</button>
        <div class="rc-footer-right">
          <button class="rc-btn rc-btn-ghost" @click="emit('update:show', false)">取消</button>
          <button class="rc-btn rc-btn-primary" :disabled="saving" @click="save">
            {{ saving ? "保存中..." : "保存" }}
          </button>
        </div>
      </div>
    </div>
  </FloatPanel>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: String, default: "" },
});
const emit = defineEmits(["update:show", "saved"]);

const loading = ref(false);
const saving = ref(false);
const rules = ref(null); // { delayed: {...}, ... }（存储结构）

// 规则元信息：名称 / 描述 / 数字参数 / 等级参数
// 展示顺序 = 项目风险 → 任务风险 → 批注风险（与风险条目排序一致）
const RULE_META = {
  projectOverdue: {
    category: "project",
    name: "项目逾期",
    desc: "项目已超过计划结束日期",
    nums: [],
    levels: [{ field: "level", label: "等级" }],
  },
  projectStagnant: {
    category: "project",
    name: "项目停滞",
    desc: "状态「进行中」但无未完成任务",
    nums: [],
    levels: [{ field: "level", label: "等级" }],
  },
  delayed: {
    category: "task",
    name: "任务延期",
    desc: "截止日期早于今天 N 天以上且未完成",
    nums: [{ field: "days", label: "阈值(天)", min: 0, max: 365 }],
    levels: [{ field: "level", label: "等级" }],
  },
  nearDeadline: {
    category: "task",
    name: "逼近截止",
    desc: "N 天内到期（含今天）且未完成",
    nums: [{ field: "days", label: "窗口(天)", min: 0, max: 90 }],
    levels: [{ field: "level", label: "等级" }],
  },
  noDateTasks: {
    category: "task",
    name: "任务缺日期",
    desc: "任务数 ≥ N 且缺日期任务占比 ≥ M%",
    nums: [
      { field: "minTotal", label: "任务数", min: 1, max: 500 },
      { field: "ratioPct", label: "占比%", min: 0, max: 100 },
    ],
    levels: [{ field: "level", label: "等级" }],
  },
  annotationBacklog: {
    category: "annotation",
    name: "待确认批注积压",
    desc: "待确认批注 ≥ N 条时提示",
    nums: [{ field: "minCount", label: "数量", min: 1, max: 50 }],
    levels: [{ field: "level", label: "等级" }],
  },
};

// 分组：项目风险 → 任务风险 → 批注风险（与 RULE_META 声明顺序一致）
const GROUP_LABELS = [
  { key: "project", label: "项目风险" },
  { key: "task", label: "任务风险" },
  { key: "annotation", label: "批注风险" },
];
const groupedRules = computed(() => {
  if (!rules.value) return [];
  return GROUP_LABELS.map((g) => ({
    label: g.label,
    items: Object.entries(RULE_META)
      .filter(([, meta]) => meta.category === g.key)
      .map(([key, meta]) => {
        const rule = rules.value[key] || {};
        return {
          key,
          ...meta,
          rule,
          nums: meta.nums.map((n) => (n.field === "ratioPct" ? { ...n, field: "ratio" } : n)),
        };
      }),
  }));
});

async function load() {
  if (!props.projectId) return;
  loading.value = true;
  const res = await api(`api/projects/${props.projectId}/risk-config`, { silent: true });
  loading.value = false;
  if (res?.ok && res.data?.rules) {
    const r = JSON.parse(JSON.stringify(res.data.rules));
    // ratio 0-1 → 百分比展示
    if (typeof r.noDateTasks?.ratio === "number") r.noDateTasks.ratio = Math.round(r.noDateTasks.ratio * 100);
    rules.value = r;
  } else {
    toast("风险配置加载失败");
  }
}

function onNumChange(rule, num, e) {
  let v = Number(e.target.value);
  if (!Number.isFinite(v)) v = num.min || 0;
  v = Math.max(num.min || 0, Math.min(num.max ?? 999999, v));
  rule[num.field] = num.field === "ratio" ? v : Math.floor(v);
  e.target.value = rule[num.field];
}

function resetDefault() {
  const res = JSON.parse(JSON.stringify(RESET_DEFAULT));
  if (typeof res.noDateTasks?.ratio === "number") res.noDateTasks.ratio = Math.round(res.noDateTasks.ratio * 100);
  rules.value = res;
}

// 后端默认值（与 lib/data.js DEFAULT_RISK_CONFIG 对齐）
const RESET_DEFAULT = {
  delayed: { enabled: true, days: 0, level: "high" },
  nearDeadline: { enabled: true, days: 3, level: "medium" },
  annotationBacklog: { enabled: true, minCount: 3, level: "medium" },
  projectOverdue: { enabled: true, level: "high" },
  noDateTasks: { enabled: true, minTotal: 3, ratio: 0.6, level: "low" },
  projectStagnant: { enabled: true, level: "medium" },
  riskAnnotation: { enabled: true, unconfirmedLevel: "medium", confirmedLevel: "high" },
};

async function save() {
  if (!rules.value || !props.projectId) return;
  saving.value = true;
  const payload = JSON.parse(JSON.stringify(rules.value));
  if (typeof payload.noDateTasks?.ratio === "number") payload.noDateTasks.ratio = Math.max(0, Math.min(100, payload.noDateTasks.ratio)) / 100;
  const res = await api(`api/projects/${props.projectId}/risk-config`, { method: "PUT", body: JSON.stringify({ rules: payload }) });
  saving.value = false;
  if (res?.ok) {
    toast("风险规则已保存");
    emit("saved");
    emit("update:show", false);
  } else {
    toast(res?.error || "保存失败");
  }
}

// 打开时加载
watch(
  () => props.show,
  (v) => {
    if (v) load();
  }
);
</script>

<style scoped>
.rc-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 18px 12px;
  gap: 10px;
  overflow: hidden;
}
.rc-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
/* 类别分组标题（项目风险 / 任务风险 / 批注风险） */
.rc-group {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.12em;
  padding: 10px 2px 6px;
}
.rc-group:first-child {
  padding-top: 0;
}
.rc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  flex-shrink: 0; /* footer 固定底部，内容区滚动 */
}
.rc-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
  flex-shrink: 0;
}
.rc-loading {
  padding: 30px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.rc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--bg-card);
}
.rc-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.rc-row-info {
  min-width: 0;
}
.rc-row-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
.rc-row-desc {
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.4;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-row-ctrls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.rc-num {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rc-num-label {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.rc-input {
  width: 56px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
  padding: 0 6px;
  outline: none;
}
.rc-input:focus {
  border-color: var(--accent);
}
.rc-select {
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 12.5px;
  padding: 0 4px;
  outline: none;
}
.rc-input:disabled,
.rc-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.rc-footer-right {
  display: flex;
  gap: 8px;
}
.rc-btn {
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.rc-btn:hover {
  border-color: var(--text-tertiary);
}
.rc-btn-ghost {
  border-color: transparent;
  background: none;
  color: var(--text-secondary);
}
.rc-btn-ghost:hover {
  color: var(--text);
}
.rc-btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-card);
}
.rc-btn-primary:hover {
  opacity: 0.88;
}
.rc-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 开关 */
.rc-switch {
  position: relative;
  flex-shrink: 0;
  width: 34px;
  height: 18px;
  cursor: pointer;
}
.rc-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.rc-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--border);
  transition: background var(--duration-fast) var(--ease-out);
}
.rc-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-card);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform var(--duration-fast) var(--ease-out);
}
.rc-switch input:checked + .rc-switch-track {
  background: var(--accent);
}
.rc-switch input:checked + .rc-switch-track::after {
  transform: translateX(16px);
}
</style>
