<template>
  <FloatPanel
    :model-value="show"
    title="版本历史"
    :default-width="860"
    :default-height="600"
    :min-width="640"
    :min-height="420"
    @update:model-value="emit('update:show', $event)"
    @close="emit('close')"
  >
    <div class="vh-body" v-loading="loading">
      <!-- 左：版本列表 -->
      <div class="vh-list">
        <div class="vh-list-head">
          <span>版本（{{ versions.length }}）</span>
          <span class="vh-hint">保留最近 50 版</span>
        </div>
        <div class="vh-items">
          <div
            v-for="v in versions"
            :key="v.id"
            class="vh-item"
            :class="{ active: v.id === compareId }"
            @click="selectCompare(v)"
          >
            <div class="vh-item-line1">
              <span class="vh-no">v{{ v.versionNo }}</span>
              <span v-if="v.label" class="vh-label">{{ v.label }}</span>
              <span class="vh-time">{{ formatTime(v.createdAt) }}</span>
            </div>
            <div class="vh-item-title">{{ v.title || "（无标题）" }}</div>
          </div>
          <div v-if="!versions.length && !loading" class="vh-empty">暂无版本记录</div>
        </div>
      </div>

      <!-- 右：对比视图 -->
      <div class="vh-view">
        <div class="vh-view-head">
          <span class="vh-vs">v{{ baseVersion?.versionNo ?? "—" }} → v{{ compareVersion?.versionNo ?? "—" }}</span>
          <button
            class="vh-restore"
            :disabled="!compareVersion || restoring"
            title="将该版本内容作为新版本保存（版本链不断，可随时再还原）"
            @click="askRestore"
          >
            还原到此版本
          </button>
        </div>
        <div class="vh-fields">
          <div class="vh-field">
            <div class="vh-field-name">标题</div>
            <div class="vh-field-body" v-html="titleHtml"></div>
          </div>
          <div class="vh-field" v-if="extraDiff.length">
            <div class="vh-field-name">状态与属性</div>
            <div class="vh-field-body vh-extra">
              <span v-for="(d, i) in extraDiff" :key="i" class="vh-extra-item">
                {{ d.name }}：<del v-if="d.a !== d.b" class="vd-del-inline">{{ d.a }}</del>
                <span :class="{ 'vd-add-inline': d.a !== d.b }">{{ d.b }}</span>
              </span>
            </div>
          </div>
          <div class="vh-field">
            <div class="vh-field-name">内容</div>
            <div class="vh-field-body vh-rich vd-body" @click="onRichClick" >
            <div class="vd-diff-head">
              <div class="vd-pane-label">旧版（上一版）</div>
              <div class="vd-pane-label">新版（当前版本）</div>
            </div>
            <div v-html="bodyHtml"></div>
          </div>
          </div>
          <div v-if="same" class="vh-same-tip">两个版本内容一致</div>
          <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="confirmShow"
      :message="`将内容还原到 v${compareVersion?.versionNo}？还原内容将作为新版本保存，版本链不断，可随时再还原回来。`"
      confirm-text="还原"
      @close="confirmShow = false"
      @confirm="doRestore"
    />
  </FloatPanel>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import FloatPanel from "../../../components/FloatPanel.vue";
import ConfirmModal from "../../../components/ConfirmModal.vue";
import { listVersions, restoreVersion } from "../../../api/modules/version.js";
import { toast } from "../../../toast.js";
import { renderDiff } from "../../../utils/versionDiff.js";
import { useRichImagePreview } from "../../../utils/richImagePreview.js";

const props = defineProps({
  show: { type: Boolean, default: false },
  projectId: { type: String, required: true },
  targetType: { type: String, required: true }, // 'plan' | 'requirement'
  targetId: { type: String, required: true },
});
const emit = defineEmits(["update:show", "close", "restored"]);

const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();

const loading = ref(false);
const versions = ref([]);
const compareId = ref("");
const restoring = ref(false);
const confirmShow = ref(false);

// 基线：对比版的下一版（更旧）；无下一版时两版相同显示一致
const baseVersion = computed(() => {
  const idx = versions.value.findIndex((v) => v.id === compareId.value);
  if (idx === -1) return null;
  return versions.value[idx + 1] || versions.value[idx];
});
const compareVersion = computed(() => versions.value.find((v) => v.id === compareId.value) || null);

const diff = computed(() => {
  if (!baseVersion.value || !compareVersion.value) return { titleHtml: "", bodyHtml: "", same: true };
  return renderDiff(baseVersion.value, compareVersion.value);
});
const titleHtml = computed(() => diff.value.titleHtml || ESC(compareVersion.value?.title || ""));
const bodyHtml = computed(() => diff.value.bodyHtml);
const same = computed(() => diff.value.same);

const extraDiff = computed(() => {
  const a = baseVersion.value?.extra || {};
  const b = compareVersion.value?.extra || {};
  const names = { status: "状态", priority: "优先级" };
  const out = [];
  for (const k of Object.keys(names)) {
    const av = a[k] || "—";
    const bv = b[k] || "—";
    if (av !== bv || (a[k] && b[k])) out.push({ name: names[k], a: av, b: bv });
  }
  return out;
});

function ESC(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  const res = await listVersions(props.projectId, { targetType: props.targetType, targetId: props.targetId });
  loading.value = false;
  if (seq !== loadSeq || !props.show) return;
  if (res?.ok) {
    versions.value = res.data.items || [];
    // 默认对比最新一版（基线=上一版）
    compareId.value = versions.value[0]?.id || "";
  } else {
    toast(res?.error || "加载版本失败", "error");
  }
}

function selectCompare(v) {
  compareId.value = v.id;
}

function askRestore() {
  if (!compareVersion.value) return;
  confirmShow.value = true;
}

async function doRestore() {
  confirmShow.value = false;
  restoring.value = true;
  const res = await restoreVersion(
    props.projectId,
    compareVersion.value.id,
    { targetType: props.targetType, targetId: props.targetId }
  );
  restoring.value = false;
  if (res?.ok) {
    toast("已还原（旧内容已存为新版本）");
    emit("restored");
    load();
  } else {
    toast(res?.error || "还原失败", "error");
  }
}

watch(() => [props.show, props.targetId], () => {
  if (props.show && props.targetId) load();
}, { immediate: true });
</script>

<style scoped>
.vh-body {
  height: 100%;
  display: flex;
  gap: 0;
  box-sizing: border-box;
  padding: 12px 16px;
}
/* 左：列表 */
.vh-list {
  flex: none;
  width: 230px;
  display: flex;
  flex-direction: column;
  border-right: 0.5px solid var(--border);
  padding-right: 10px;
  min-height: 0;
}
.vh-list-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding-bottom: 8px;
}
.vh-hint { font-size: 10.5px; font-weight: 400; color: var(--text-tertiary); }
.vh-items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.vh-item {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.vh-item:hover { background: var(--bg-hover); }
.vh-item.active { border-color: var(--accent); background: var(--accent-light); }
.vh-item-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.vh-no {
  font-family: "JetBrains Mono", monospace;
  color: var(--accent);
  font-weight: 500;
}
.vh-label {
  background: var(--accent-warm-subtle);
  color: var(--accent-warm-hover);
  border-radius: 8px;
  padding: 0 6px;
  font-size: 10px;
}
.vh-time { margin-left: auto; font-variant-numeric: tabular-nums; }
.vh-item-title {
  font-size: 12px;
  color: var(--text);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vh-empty { color: var(--text-tertiary); font-size: 12px; text-align: center; padding: 24px 0; }

/* 右：对比 */
.vh-view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding-left: 14px;
  min-height: 0;
}
.vh-view-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  flex-shrink: 0;
}
.vh-vs { font-size: 12.5px; font-weight: 600; color: var(--text); }
.vh-restore {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.vh-restore:hover:not(:disabled) { background: var(--accent-light); }
.vh-restore:disabled { color: var(--text-tertiary); cursor: not-allowed; }
.vh-fields {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.vh-field-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.vh-field-body {
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.7;
  background: var(--bg);
  border: 0.5px solid var(--border-light);
  border-radius: 6px;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
.vh-rich { font-family: inherit; }
.vh-extra { display: flex; gap: 16px; flex-wrap: wrap; }
.vh-extra-item { font-size: 12px; }
.vh-same-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 10px;
}
/* diff 标记（白底双栏风格） */
:deep(.vd-body) {
  background: #fff;
  color: #24292f;
  border-color: #d0d7de;
  padding: 0;
  white-space: normal;
}
:deep(.vd-diff-head) {
  display: flex;
  border-bottom: 1px solid #d0d7de;
}
:deep(.vd-pane-label) {
  flex: 1;
  padding: 6px 12px;
  font-size: 11.5px;
  color: #57606a;
  background: #f6f8fa;
}
:deep(.vd-pane-label + .vd-pane-label) { border-left: 1px solid #d0d7de; }:deep(.vd-row) { display: flex; align-items: stretch; min-height: 20px; }
:deep(.vd-cell) {
  flex: 1;
  min-width: 0;
  padding: 4px 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: #24292f;
  overflow-wrap: anywhere;
}
:deep(.vd-l) { border-right: 1px solid #eaeef2; }
:deep(.vd-same) { color: #24292f; }
/* 修改行：白底，仅变化片段上色（vd-del/vd-add 词块） */
/* 单侧行：只有存在的一侧有内容，无底色标注 */
:deep(.vd-del .vd-l), :deep(.vd-add .vd-r) { background: #fff; }
/* 表格：与详情弹窗 rich-view 对齐（v-html 内任意表格统一生效） */
:deep(.vd-body table) {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin: 8px 0;
  font-size: inherit;
}
:deep(.vd-body th), :deep(.vd-body td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  line-height: 1.6;
  word-break: break-word;
}
:deep(.vd-body th) { background: var(--bg-hover); font-weight: 600; }
:deep(.vd-tr-add td) { background: #d2f8d2; }
:deep(.vd-tr-del td) { background: #ffebe9; }
:deep(.vd-td-mod) { background: #fdf3d8; }
/* 图片：缩略图限宽，点击预览（useRichImagePreview） */
:deep(.vd-body img) {
  max-width: 250px;
  max-height: 150px;
  height: auto;
  width: auto;
  border-radius: 6px;
  cursor: zoom-in;
  object-fit: contain;
}
:deep(.vd-add) {
  text-decoration: none;
  background: #acf2bd;
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
}
:deep(.vd-del) {
  text-decoration: none;
  background: #fdb8c0;
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
}
:deep(.vd-del-inline), :deep(ins) { text-decoration: none; }
:deep(del) { text-decoration: none; }
.vd-add-inline {
  background: #acf2bd;
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
}
.vd-del-inline {
  text-decoration: none;
  background: #fdb8c0;
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
  margin-right: 4px;
}
</style>
