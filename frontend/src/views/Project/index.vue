<template>
  <div class="detail-view">
    <!-- 面包屑：返回 + 层级 -->
    <div class="detail-crumb">
      <button class="crumb-back" title="返回项目列表" @click="$emit('back')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <span class="crumb-item crumb-root" @click="$emit('back')">全部项目</span>
      <template v-if="currentSetLabel">
        <span class="crumb-sep">/</span>
        <span class="crumb-item">{{ currentSetLabel }}</span>
      </template>
      <span class="crumb-sep">/</span>
      <span class="crumb-item crumb-current">{{ p?.name || '加载中...' }}</span>
    </div>

    <!-- 主区：详情卡（单列，无日历） -->
    <div class="detail-main">
      <ProjectMeta :project="p" :set-label="currentSetLabel" @edit="showEditModal = true" @back="$emit('back')" @delete="onDeleteProject" @change-status="changeStatus" @archive="onArchiveProject" @unarchive="onUnarchiveProject" @search="searchShow = true" />
    </div>

    <!-- 项目概览（V2.0 S13）：折叠面板，summary 数据随 loadProject 联动刷新 -->
    <ProjectOverview ref="overviewRef" :project-id="p?.id || ''" @jump-task="(taskId) => onTabCalendarSelectTask({ taskId })" @jump-annotation="onJumpAnnotation" />

    <!-- Tab 区 -->
    <section class="tab-section">
      <div ref="tabBarRef" class="tab-bar" :class="{ compact: barCompact, mini: barMini }" @click="closeTabMenu">
        <draggable
          v-model="tabDragList"
          item-key="key"
          ghost-class="tab-ghost"
          handle=".tab-btn"
          :animation="150"
          :force-fallback="true"
          fallback-on-body
          fallback-tolerance="8"
          class="tab-bar-tabs"
          @end="onTabDragEnd"
        >
          <template #item="{ element: key }">
            <button
              class="tab-btn"
              :class="{ active: tab === key }"
              @click="onTabClick(key)"
              @contextmenu.prevent="onTabContextMenu($event)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="defSvg(key)"></svg>
              <span class="tab-label">{{ defLabel(key) }}</span>
            </button>
          </template>
        </draggable>
        <div class="tab-bar-spacer"></div>
        <div class="tab-bar-right">
          <div v-if="tab === 'tasks'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="taskSearch" class="task-search-input" placeholder="搜索任务" @click.stop />
            <button v-if="taskSearch" class="task-search-clear" title="清空" @click="taskSearch = ''">×</button>
          </div>
          <div v-if="tab === 'plans'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="planSearch" class="task-search-input" placeholder="搜索方案标题" @click.stop />
            <button v-if="planSearch" class="task-search-clear" title="清空" @click="planSearch = ''">×</button>
          </div>
          <el-select v-if="tab === 'plans'" v-model="planStatus" class="plan-status-select" size="small" @click.stop>
            <el-option v-for="s in PLAN_STATUS_FILTERS" :key="s" :label="s" :value="s" />
          </el-select>
          <!-- 需求筛选（tab 栏右上角，与方案筛选同形态）：搜索框 + 状态下拉 -->
          <div v-if="tab === 'requirements'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="requirementSearch" class="task-search-input" placeholder="搜索需求" @click.stop />
            <button v-if="requirementSearch" class="task-search-clear" title="清空" @click="requirementSearch = ''">×</button>
          </div>
          <el-select v-if="tab === 'requirements'" v-model="requirementStatus" class="plan-status-select" size="small" @click.stop>
            <el-option v-for="s in REQUIREMENT_STATUS_FILTERS" :key="s" :label="s" :value="s" />
          </el-select>
          <!-- 需求排序（R12）：默认排序 / 等级排序，切换即时刷新 -->
          <el-select v-if="tab === 'requirements'" v-model="requirementSort" class="sort-select" size="small" @click.stop title="需求排序">
            <el-option label="默认排序" value="default" />
            <el-option label="等级排序" value="priority" />
          </el-select>
          <!-- 审计筛选：行为下拉 + 时间范围（daterange，与其他 tab 对齐右上角） -->
          <el-select v-if="tab === 'audit'" v-model="auditAction" class="audit-filter-action" size="small" clearable placeholder="全部行为" @click.stop>
            <el-option v-for="a in auditActions" :key="a" :label="a" :value="a" />
          </el-select>
          <el-date-picker
            v-if="tab === 'audit'"
            v-model="auditDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            size="small"
            class="audit-filter-range"
            style="height: 31px"
            @click.stop
          />
          <!-- 批注管理（排序按钮右侧）：打开大屏批注管理弹窗 -->
          <button v-if="tab === 'tasks'" class="header-btn" @click="annotManageShow = true" title="批注管理">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            批注管理
          </button>
          <!-- 任务排序（展开按钮左侧）：下拉选择 默认 / 时间 / 等级 -->
          <el-select v-if="tab === 'tasks'" v-model="taskSort" size="small" class="sort-select" :title="sortTip">
            <el-option v-for="opt in sortOptions" :key="opt.value" :label="opt.label" :value="opt.value">
              <span class="sort-opt-label">{{ opt.label }}</span>
              <span class="sort-opt-tip">{{ opt.tip }}</span>
            </el-option>
          </el-select>
          <button v-if="tab === 'tasks'" class="header-btn" @click="toggleExpandAll" title="展开或收起全部任务">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline v-if="expandAll" points="7 11 12 6 17 11"></polyline>
              <polyline v-if="expandAll" points="7 17 12 12 17 17"></polyline>
              <polyline v-if="!expandAll" points="7 13 12 18 17 13"></polyline>
              <polyline v-if="!expandAll" points="7 7 12 12 17 7"></polyline>
            </svg>
            {{ expandAll ? '收起' : '展开' }}
          </button>
          <!-- 文件搜索（tab 栏新建按钮左侧，与任务/方案/需求同形态） -->
          <div v-if="tab === 'files'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="fileSearch" class="task-search-input" placeholder="搜索文件名称" @click.stop />
            <button v-if="fileSearch" class="task-search-clear" title="清空" @click="fileSearch = ''">×</button>
          </div>
          <!-- 文件排序（V2.3.3，新建按钮左侧）：默认 / 名称 / 类型，持久化 -->
          <el-select v-if="tab === 'files'" v-model="fileSort" class="sort-select" size="small" @click.stop title="文件排序">
            <el-option label="默认排序" value="default" />
            <el-option label="名称排序" value="name" />
            <el-option label="类型排序" value="type" />
          </el-select>
          <button v-if="tab === 'plans'" class="header-btn" :disabled="compareCount < 2" :title="compareCount < 2 ? '勾选 2 个方案后对比' : '对比选中的 2 个方案'" @click="planTabRef?.openCompare()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            对比选中{{ compareCount > 0 ? `（${compareCount}/2）` : "" }}
          </button>
          <!-- 验证搜索（tab 栏新建按钮左侧，与文件搜索同形态） -->
          <div v-if="tab === 'verification'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="verificationSearch" class="task-search-input" placeholder="搜索验证名称/备注/id" @click.stop />
            <button v-if="verificationSearch" class="task-search-clear" title="清空" @click="verificationSearch = ''">×</button>
          </div>
          <!-- 备注搜索（tab 栏新建按钮左侧，与验证搜索同形态） -->
          <div v-if="tab === 'notes'" class="task-search">
            <svg class="task-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="noteSearch" class="task-search-input" placeholder="搜索备注内容" @click.stop />
            <button v-if="noteSearch" class="task-search-clear" title="清空" @click="noteSearch = ''">×</button>
          </div>
          <button v-if="tab === 'verification'" class="header-btn" @click="verificationTabRef?.openCategoryManager()">分组管理</button>
          <button v-if="tab !== 'calendar' && tab !== 'audit'" class="header-btn header-btn-primary" @click="onTabAction">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建
          </button>
          <!-- 前往日历：统一弹窗（单项目任务日历），仅任务 tab 显示 -->
          <button v-if="tab === 'tasks'" class="header-btn" @click="calShow = true" title="项目任务日历">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            前往日历 >
          </button>
        </div>
        <!-- 右键菜单（teleport 到 body，点击空白关闭） -->
        <teleport to="body">
          <div v-if="tabMenuShow" class="tab-cxt-menu" :style="{ left: tabMenuPos.x + 'px', top: tabMenuPos.y + 'px' }" @click.stop>
            <div class="tab-cxt-item" @click="tabMenuAction('settings')">Tab 设置…</div>
            <div class="tab-cxt-item" @click="tabMenuAction('reset')">重置默认顺序</div>
          </div>
        </teleport>
        <!-- Tab 设置弹窗 -->
        <TabConfigModal
          v-if="tabConfigShow"
          :defs="TAB_DEFS"
          :draft="tabCfgDraft"
          @cancel="tabConfigShow = false"
          @apply="tabCfgApply"
        />
      </div>
      <div class="tab-content">
        <TaskTab
          v-if="tab === 'tasks'"
          ref="taskTabRef"
          :project-id="p?.id || ''"
          :tasks="filteredTasks"
          :files="p?.files || []"
          :members="p?.members || []"
          :plan-start="p?.planStart || ''"
          :plan-end="p?.planEnd || ''"
          :search-query="taskSearch"
          :expand-all="expandAll"
          :sort-mode="taskSort"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <FileTab
          v-if="tab === 'files'"
          ref="fileTabRef"
          :project-id="p?.id || ''"
          :files="p?.files || []"
          :folders="p?.folders || []"
          :sort-mode="fileSort"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <NoteTab
          v-if="tab === 'notes'"
          ref="noteTabRef"
          :project-id="p?.id || ''"
          :notes="p?.notes || []"
          :search-query="noteSearch"
          @changed="loadProject"
          @confirm-ask="onConfirm"
        />
        <AuditTab
          v-if="tab === 'audit'"
          ref="auditTabRef"
          :project-id="p?.id || ''"
          :project="p"
          :action-filter="auditAction"
          :date-from="auditDateRange?.[0] || ''"
          :date-to="auditDateRange?.[1] || ''"
          @actions-ready="onAuditActionsReady"
        />
        <PlanTab
          v-if="tab === 'plans'"
          ref="planTabRef"
          :project-id="p?.id || ''"
          :search-query="planSearch"
          :status-query="planStatus"
          @changed="loadProject"
          @jump-task="onTabCalendarSelectTask"
          @compare-count="compareCount = $event"
        />
        <!-- 需求 tab（V2.1.3 需求管理） -->
        <RequirementTab
          v-if="tab === 'requirements'"
          ref="requirementTabRef"
          :project-id="p?.id || ''"
          :search-query="requirementSearch"
          :status-query="requirementStatus"
          :sort-query="requirementSort"
          @changed="loadProject"
        />
        <!-- 验证 tab（V2.6）：验证卡列表 + 详情弹窗 -->
        <VerificationTab
          v-if="tab === 'verification'"
          ref="verificationTabRef"
          :project-id="p?.id || ''"
          :search-query="verificationSearch"
          :plan-filter="verificationFilters.planIds"
          :task-filter="verificationFilters.taskIds"
          @changed="loadProject"
        />
      </div>
    </section>

    <ProjectFormModal
      :show="showEditModal"
      mode="edit"
      :data="p"
      :sets="allSets"
      @close="showEditModal = false"
      @save="doEditProject"
    />

    <!-- 批注管理大屏弹窗（任务 tab 右上角按钮打开） -->
    <AnnotationManagerModal
      v-model="annotManageShow"
      :project-id="p?.id || ''"
      :tasks="p?.tasks || []"
      @changed="loadProject"
    />

    <!-- 项目日历弹窗（tab 栏「前往日历 >」打开，单项目任务日历） -->
    <CalendarModal
      v-model="calShow"
      :projects="p ? [p] : []"
      :sets="allSets"
      task-mode
      :project-id="p?.id || ''"
      @select-task="(payload) => { calShow = false; onTabCalendarSelectTask(payload) }"
    />

    <ConfirmModal
      :show="confirm.show"
      :message="confirm.message"
      :confirm-text="confirm.confirmText"
      @close="confirm.show = false"
      @confirm="doConfirm"
    />

    <!-- V2.3 R2：项目内全文搜索弹窗 -->
    <SearchPanel v-model="searchShow" :project-id="p?.id || ''" title="项目内搜索" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, reactive, onMounted, onUnmounted, toRefs } from "vue";
import { api } from "../../api.js";
import { usePersistedTabState } from "../../utils/usePersistedTabState.js";
import { toast } from "../../toast.js";
import ProjectMeta from "./components/ProjectMeta.vue";
import ProjectOverview from "./components/ProjectOverview.vue";
import TaskTab from "./components/TaskTab.vue";
import FileTab from "./components/FileTab.vue";
import NoteTab from "./components/NoteTab.vue";
import AuditTab from "./components/AuditTab.vue";
import PlanTab from "./components/PlanTab.vue";
import RequirementTab from "./components/RequirementTab.vue";
import VerificationTab from "./components/VerificationTab.vue";
import ConfirmModal from "../../components/ConfirmModal.vue";
import SearchPanel from "../../components/SearchPanel.vue";
import { consumeJumpMark } from "../../utils/jump.js";
import ProjectFormModal from "../Home/components/ProjectFormModal.vue";
import AnnotationManagerModal from "./components/AnnotationManagerModal.vue";
import CalendarModal from "../../components/CalendarModal.vue";
import draggable from "vuedraggable";
import TabConfigModal from "./components/TabConfigModal.vue";

const props = defineProps({ projectId: String });
const emit = defineEmits(["back"]);

const p = ref(null);
const allSets = ref([]);
const taskTabRef = ref(null);
const fileTabRef = ref(null);
const noteTabRef = ref(null);
const auditTabRef = ref(null);
const planTabRef = ref(null);
const requirementTabRef = ref(null);
const verificationTabRef = ref(null);
const compareCount = ref(0);
const overviewRef = ref(null);

const currentSetLabel = computed(() => {
  if (!p.value?.projectSetId) return "";
  const s = allSets.value.find(s => s.id === p.value.projectSetId);
  return s ? s.name : "";
});
const fullBreadcrumb = computed(() => {
  if (!p.value) return "加载中...";
  const name = p.value.name || "";
  return currentSetLabel.value ? `${currentSetLabel.value} - ${name}` : name;
});

// ===== Tab（V2.1.3 配置化：顺序 + 显隐，全局/本项目两级配置） =====
const tabKey = `neo-pm-tab-${props.projectId}`;
const tab = ref(localStorage.getItem(tabKey) || "tasks");

/**
 * Tab 点击处理：
 * - 点击不同 tab → 切换（组件重建，自动加载数据）
 * - 点击当前 tab → 刷新项目数据（保持展开/收起状态）
 */
function onTabClick(key) {
  if (key === tab.value) {
    loadProject();
  } else {
    tab.value = key;
  }
}

watch(tab, (v) => {
  try { localStorage.setItem(tabKey, v); } catch {}
  // 各 tab 均为 v-if 按需渲染：切回时组件重建，内部 watch(projectId, immediate) 自动拉取最新数据
});

// tab 定义：默认顺序即用户指定顺序 任务》需求》方案》验证》备注》文件》审计（V2.6.1）
const TAB_DEFS = [
  {
    key: "tasks", label: "任务", svg: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/>',
  },
  {
    key: "requirements", label: "需求", svg: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  },
  {
    key: "plans", label: "方案", svg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
  },
  {
    key: "verification", label: "验证", svg: '<path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  },
  {
    key: "notes", label: "备注", svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  },
  {
    key: "files", label: "文件", svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  },
  {
    key: "audit", label: "审计", svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
];
const DEFAULT_TAB_ORDER = TAB_DEFS.map((t) => t.key);
function defLabel(key) {
  return TAB_DEFS.find((d) => d.key === key)?.label || key;
}
function defSvg(key) {
  return TAB_DEFS.find((d) => d.key === key)?.svg || "";
}
const GLOBAL_TAB_KEY = "neo-pm-tab-config";
const PROJECT_TAB_KEY = `neo-pm-tab-config-${props.projectId}`;

// 读取配置：项目级 > 全局 > 默认
function readTabConfig() {
  for (const key of [PROJECT_TAB_KEY, GLOBAL_TAB_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (Array.isArray(cfg.order)) return { ...cfg, scope: key === PROJECT_TAB_KEY ? "project" : "global" };
      }
    } catch { /* ignore */ }
  }
  return { order: [...DEFAULT_TAB_ORDER], hidden: [], scope: "default" };
}
const tabConfig = ref(readTabConfig());
// 可见 tab（按配置顺序渲染）
// V2.6：配置 order 未包含的新增 tab（如「验证」）追加到末尾，避免老配置吞掉新 tab
const tabList = computed(() => {
  const configured = tabConfig.value.order
    // 过滤已删除/无效 tab（如历史配置里残留的 knowledge）
    .filter((k) => TAB_DEFS.some((d) => d.key === k));
  const missing = TAB_DEFS.filter((d) => !configured.includes(d.key)).map((d) => d.key);
  return [...configured, ...missing]
    .filter((k) => !(tabConfig.value.hidden || []).includes(k));
});
// 拖拽用可变数组（v-model 绑定），配置变化时同步
const tabDragList = ref([]);
watch(tabConfig, () => { tabDragList.value = tabList.value; }, { immediate: true });
// 激活 tab 被配置隐藏时自动切到第一个可见（含初始化场景）
watch(tabList, (list) => {
  if (!list.includes(tab.value) && list.length) tab.value = list[0];
}, { immediate: true });
function persistTabConfig(order, hidden, scope) {
  const cfg = { order: [...order], hidden: [...(hidden || [])] };
  try { localStorage.setItem(scope === "project" ? PROJECT_TAB_KEY : GLOBAL_TAB_KEY, JSON.stringify(cfg)); } catch {}
  tabConfig.value = { ...cfg, scope };
  // 当前激活 tab 被隐藏时自动切到第一个可见
  if (!tabList.value.includes(tab.value) && tabList.value.length) tab.value = tabList.value[0];
}

// ===== Tab 设置弹窗 =====
const tabConfigShow = ref(false);
const tabCfgDraft = ref(null); // { order, hidden }
function openTabConfig() {
  const cur = readTabConfig();
  tabCfgDraft.value = { order: [...cur.order], hidden: [...(cur.hidden || [])] };
  tabConfigShow.value = true;
}
function tabCfgApply(scope, draft) {
  if (!draft) return;
  // 至少保留 1 个可见
  const visible = draft.order.filter((k) => !draft.hidden.includes(k));
  if (!visible.length) return toast("至少保留 1 个可见 tab", "error");
  persistTabConfig(draft.order, draft.hidden, scope);
  // 全局应用语义：所有项目统一使用全局配置，清除项目级覆盖（否则重开弹窗仍读项目级旧配置）
  if (scope === "global") {
    try { localStorage.removeItem(PROJECT_TAB_KEY); } catch {}
  }
  tabConfigShow.value = false;
  toast(scope === "project" ? "已应用到本项目" : "已应用到全部项目");
}

// ===== Tab 右键菜单 =====
const tabMenuShow = ref(false);
const tabMenuPos = ref({ x: 0, y: 0 });
function onTabContextMenu(e) {
  e.preventDefault();
  tabMenuPos.value = { x: e.clientX, y: e.clientY };
  tabMenuShow.value = true;
}
// 右键菜单项
function tabMenuAction(action) {
  tabMenuShow.value = false;
  if (action === "settings") openTabConfig();
  else if (action === "reset") persistTabConfig([...DEFAULT_TAB_ORDER], [], readTabConfig().scope === "project" ? "project" : "global");
}
// 点击空白处关闭菜单
function closeTabMenu() { tabMenuShow.value = false; }

// tab 条拖拽调序：直接应用并保存到全局配置（拖拽是快捷调序，弹窗负责显隐/精细调整）
function onTabDragEnd() {
  const order = [...tabDragList.value]; // tabDragList 已被 draggable 重排（v-model）
  const cur = readTabConfig();
  persistTabConfig(order, cur.hidden, "global");
}

// tab 条宽度自适应：视口缩小时先收右侧按钮（mini），更窄再隐藏 tab 文字（compact）
const tabBarRef = ref(null);
const barCompact = ref(false);
const barMini = ref(false);
let barObs = null;

// ===== V2.3 R2：项目内搜索 + 跳转消费 =====
const searchShow = ref(false);

/**
 * 搜索结果/消息跳转（本项目内）：切 tab + 定位/打开详情
 * type: task | annotation | plan | requirement | note | file
 */
function handleJump({ type, refId }) {
  if (!type || !refId) return;
  if (type === "task") {
    tab.value = "tasks";
    nextTick(() => taskTabRef.value?.scrollToTaskById?.(refId));
  } else if (type === "annotation") {
    tab.value = "tasks";
    nextTick(() => taskTabRef.value?.scrollToAnnotationById?.(refId));
  } else if (type === "plan") {
    tab.value = "plans";
    nextTick(() => planTabRef.value?.openDetailById?.(refId));
  } else if (type === "requirement") {
    tab.value = "requirements";
    nextTick(() => requirementTabRef.value?.openDetailById?.(refId));
  } else if (type === "note") {
    // 备注内容在项目概览折叠面板（ProjectOverview 独立组件，非 tab）；切合法 tab + 提示，避免无效 tab 空白
    tab.value = "tasks";
    toast("备注内容请在项目概览查看");
  } else if (type === "file") {
    tab.value = "files";
  } else if (type === "verification") {
    tab.value = "verification";
    nextTick(() => verificationTabRef.value?.openDetailById?.(refId));
  } else if (type === "verification_item") {
    // FTS ref_id = 所属验证卡 id
    tab.value = "verification";
    nextTick(() => verificationTabRef.value?.openDetailById?.(refId));
  } else if (type === "verification_category") {
    // ref_id = 分类名：打开验证 tab（不定位具体卡片）
    tab.value = "verification";
    toast(`命中的是验证分组「${refId}」，已打开验证列表`);
  } else if (type === "comment") {
    // FTS ref_id = target_type|target_id：定位到所属方案/需求详情
    const sep = String(refId).indexOf("|");
    const tt = sep > 0 ? refId.slice(0, sep) : "";
    const tid = sep > 0 ? refId.slice(sep + 1) : "";
    if (tt === "plan") {
      tab.value = "plans";
      nextTick(() => planTabRef.value?.openDetailById?.(tid));
    } else if (tt === "requirement") {
      tab.value = "requirements";
      nextTick(() => requirementTabRef.value?.openDetailById?.(tid));
    }
  }
}

/** 全局/消息面板跳转事件：目标项目即本项目时直接处理（App 负责跨项目切换） */
function onGlobalJump(e) {
  const { type, projectId: pid, refId } = e.detail || {};
  if (!pid || pid !== props.projectId) return;
  // 同页已直接处理：立即清除 sessionStorage 标记，防止下次 loadProject 幽灵重复跳转
  consumeJumpMark();
  handleJump({ type, refId });
}

onMounted(() => {
  window.addEventListener("neo-pm:jump", onGlobalJump);
  // V2.6.1：项目内 Ctrl+F 打开项目内搜索（输入态放行；宿主拦截时自然降级）
  window.addEventListener("keydown", onProjectKeydown);
});
onUnmounted(() => {
  window.removeEventListener("neo-pm:jump", onGlobalJump);
  window.removeEventListener("keydown", onProjectKeydown);
});

function onProjectKeydown(e) {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.ctrlKey && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    // stopImmediatePropagation：App 与本组件的监听同挂 window，仅 stopPropagation 拦不住同节点的后续监听
    e.stopImmediatePropagation();
    searchShow.value = true;
  }
}

onMounted(() => {
  barObs = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect?.width || 0;
    barMini.value = w < 1100; // 先减按钮：右侧仅留新建
    barCompact.value = w < 800; // 后减文字：tab 只留图标
  });
  if (tabBarRef.value) barObs.observe(tabBarRef.value);
});
onUnmounted(() => { barObs?.disconnect(); });

// ===== 一键展开/收起 =====
// null = 未操作（子任务按默认：未完成展开、已完成折叠）；true/false = 显式展开/收起
const expandAll = ref(null);
function toggleExpandAll() {
  expandAll.value = !expandAll.value;
}

// ===== 任务排序（V2.1.2）：默认（可拖拽）/ 等级 / 开始时间 =====
// 拖拽仅默认排序可用；等级/时间排序时子任务与子子任务同样按规则排序（TaskTab sortTree 递归）
const sortOptions = [
  { value: "default", label: "默认排序", tip: "可拖拽调整顺序" },
  { value: "startDate", label: "时间排序", tip: "按开始时间，无日期排最后" },
  { value: "priority", label: "等级排序", tip: "P0 → P5" },
];

// ===== R13 五 tab 筛选/排序状态持久化（composable：读写在 localStorage，防抖 300ms） =====
// 键 neo-pm-ui-state-{version}-{projectId}-{tab}；projectId 变化自动重绑恢复，切换项目互不串状态
const tasksState = usePersistedTabState(() => `${props.projectId}-tasks`, { search: "", sort: "default" });
// R4：需求/方案 tab 的状态筛选随存档持久化恢复（去除 skipRestore），切换项目/重进页面保持上次筛选；搜索词/排序/状态均持久化
const requirementsState = usePersistedTabState(() => `${props.projectId}-requirements`, { search: "", status: "全部", sort: "default" }, 300);
const plansState = usePersistedTabState(() => `${props.projectId}-plans`, { search: "", status: "全部" }, 300);
const filesState = usePersistedTabState(() => `${props.projectId}-files`, { search: "", sort: "default" });
const auditState = usePersistedTabState(() => `${props.projectId}-audit`, { action: "", dateRange: [] });
const { search: taskSearch, sort: taskSort } = toRefs(tasksState);
const { search: requirementSearch, status: requirementStatus, sort: requirementSort } = toRefs(requirementsState);
const { search: planSearch, status: planStatus } = toRefs(plansState);
const { search: fileSearch, sort: fileSort } = toRefs(filesState);
const { action: auditAction, dateRange: auditDateRange } = toRefs(auditState);

const sortTip = computed(() => {
  const opt = sortOptions.find((o) => o.value === taskSort.value);
  if (taskSort.value === "default") return "默认排序：可拖拽调整顺序；任务与子任务均按当前规则排序";
  return `${opt?.label}：${opt?.tip}（拖拽已禁用）；任务与子任务均按此规则排序`;
});

// ===== 任务筛选 =====
// 状态筛选在 index（全部/仅未完成/仅已完成）；关键词搜索过滤统一在 TaskTab 内完成（避免双份过滤逻辑）
const annotManageShow = ref(false); // 批注管理大屏弹窗
const calShow = ref(false); // 项目日历弹窗
const PLAN_STATUS_FILTERS = ["全部", "草稿", "进行中", "已采纳", "已废弃", "已转任务"];
// 需求筛选（tab 栏右上角，与方案同形态；后端筛选 + 标题高亮）
const REQUIREMENT_STATUS_FILTERS = ["全部", "待处理", "已完成", "已取消"];
// 审计筛选：行为 + 时间范围（daterange，tab 栏右上角）
const auditActions = ref([]);
// R13：行为下拉选项就绪后校验恢复的 auditAction 是否仍存在（被删静默回落默认空=全部行为）
function onAuditActionsReady(actions) {
  auditActions.value = actions || [];
  if (auditAction.value && !auditActions.value.includes(auditAction.value)) {
    auditAction.value = "";
  }
}

const filteredTasks = computed(() => {
  return p.value?.tasks || [];
});

// ===== Load =====
async function loadProject() {
  if (!props.projectId) return;
  const res = await api(`api/projects/${props.projectId}`);
  if (!res?.ok) { toast("项目不存在", "error"); emit("back"); return; }
  p.value = res.data;
  // S13：项目数据变化（任务/文件/批注变更）后联动刷新概览总结
  overviewRef.value?.refresh();
  // 消费日历跳转标记：切到任务 tab 并滚动定位到目标任务
  let scrollId = null;
  try { scrollId = sessionStorage.getItem("neo-pm-scroll-task"); sessionStorage.removeItem("neo-pm-scroll-task"); } catch { /* ignore */ }
  if (scrollId) {
    if (tab.value !== "tasks") tab.value = "tasks";
    nextTick(() => taskTabRef.value?.scrollToTaskById?.(scrollId));
  }
  // V2.3 R2：消费跨页搜索/消息跳转标记（数据就绪后定位，避免与加载竞态）
  const j = consumeJumpMark();
  if (j && j.projectId === props.projectId) handleJump(j);
}
async function loadSets() {
  const res = await api("api/project-sets");
  if (res?.ok) allSets.value = res.data || [];
}
watch(() => props.projectId, () => { loadProject(); loadSets(); }, { immediate: true });

// ===== Edit Project =====
const showEditModal = ref(false);

async function changeStatus(status) {
  if (!p.value) return;
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ status }), silent: true });
  if (res.ok) { toast(`状态已切换为「${status}」`); loadProject(); }
  else toast(res.error || "状态切换失败", "error");  // 重复 toast 被 toast.js 内容去重
}

function onTabAction() {
  if (tab.value === 'tasks') taskTabRef.value?.openAdd();
  else if (tab.value === 'files') fileTabRef.value?.openAdd();
  else if (tab.value === 'notes') noteTabRef.value?.openAdd();
  else if (tab.value === 'plans') planTabRef.value?.openCreate();
  else if (tab.value === 'requirements') requirementTabRef.value?.openCreate();
  else if (tab.value === 'verification') verificationTabRef.value?.openCreate();
}

// ===== 验证 tab 搜索（V2.6.1）：方案/任务筛选下拉已按验收反馈移除，保留状态结构供 props 传递 =====
const verificationSearch = ref("");
const noteSearch = ref("");
const verificationFilters = ref({ planIds: [], taskIds: [] });

// 文件搜索同步到 FileTab（搜索框在 tab 栏，状态在组件内）
watch(fileSearch, (v) => { fileTabRef.value?.setSearch?.(v); });
// 文件搜索恢复后切到文件 tab 时同步初始值（FileTab 挂载前 watch 不生效）
watch(tab, (v) => {
  if (v === "files") nextTick(() => fileTabRef.value?.setSearch?.(fileSearch.value));
});
function onTabCalendarSelectTask(payload) {
  const taskId = typeof payload === "string" ? payload : payload?.taskId;
  if (!taskId) return;
  tab.value = "tasks";
  nextTick(() => taskTabRef.value?.scrollToTaskById?.(taskId));
}

// 概览/里程碑点击批注：切任务 tab → 展开祖先链 → 打开批注面板 → 高亮闪烁
function onJumpAnnotation({ taskId, annotationId }) {
  if (!taskId || !annotationId) return;
  tab.value = "tasks";
  nextTick(() => taskTabRef.value?.scrollToAnnotation?.(taskId, annotationId));
}

// ===== Archive / Unarchive（与首页右键归档同一数据调用：update_project 的 archived 参数） =====
function onArchiveProject() {
  if (!p.value) return;
  onConfirm({
    message: `确认归档项目「${p.value.name}」？归档后可在首页「已归档」分组查看，可随时恢复。`,
    confirmText: "确认归档",
    action: "archive-project",
    payload: p.value.id,
  });
}
async function onUnarchiveProject() {
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ archived: false }), silent: true });
  if (res.ok) { toast("已恢复归档"); loadProject(); }
  else toast(res.error || "操作失败", "error");
}

// ===== Delete Project =====
function onDeleteProject() {
  if (!p.value) return;
  const taskCount = p.value.taskCount ?? (p.value.tasks || []).length;
  const incompleteCount = p.value.incompleteTaskCount ?? taskCount;
  const doneCount = taskCount - incompleteCount;
  if (doneCount > 0) {
    toast(`项目「${p.value.name}」下还有 ${doneCount} 个已完成任务，无法删除`, "error");
    return;
  }
  const fileCount = p.value.fileCount ?? (p.value.files || []).length;
  const msgParts = [];
  if (incompleteCount > 0) msgParts.push(`${incompleteCount} 个未完成任务`);
  if (fileCount > 0) msgParts.push(`${fileCount} 个文件`);
  const summary = msgParts.length > 0 ? `（含 ${msgParts.join('、')}）` : '';
  onConfirm({ message: `确认删除项目「${p.value.name}」？${summary}`, action: "delete-project", payload: p.value.id });
}
async function doEditProject(d) {
  if (!d.name.trim()) return toast("请输入名称", "error");
  const members = d.members || [];
  const res = await api(`api/projects/${props.projectId}`, { method: "PUT", body: JSON.stringify({ name: d.name.trim(), description: d.description.trim(), planStart: d.planStart, planEnd: d.planEnd, status: d.status, projectSetId: d.projectSetId, members }), silent: true });
  if (res.ok) { toast("已更新"); showEditModal.value = false; loadProject(); }
  else toast(res.error || "更新失败", "error");  // 重复 toast 被 toast.js 内容去重
}

// ===== Confirm =====
const confirm = ref({ show: false, message: "", action: "", payload: null, confirmText: "确认" });
function onConfirm(e) { confirm.value = { show: true, message: e.message, action: e.action, payload: e.payload, confirmText: e.confirmText || "确认" }; }
async function doConfirm() {
  const { action, payload } = confirm.value;
  confirm.value.show = false;
  let res;
  if (action === "delete-task") {
    res = await api(`api/projects/${props.projectId}/tasks/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "delete-file") {
    // 支持单个 id 与批量数组（V2.1.4 文件系统重构：多选 Delete 批量删除登记）
    if (Array.isArray(payload)) {
      const rs = [];
      for (const fid of payload) {
        rs.push(await api(`api/projects/${props.projectId}/files/${fid}`, { method: "DELETE", silent: true }));
      }
      const failed = rs.find((r) => !r?.ok);
      res = failed ? failed : { ok: true };
    } else {
      res = await api(`api/projects/${props.projectId}/files/${payload}`, { method: "DELETE", silent: true });
    }
  } else if (action === "delete-folder") {
    // 删除文件夹：真删除（递归删子孙夹 + 其下文件登记；磁盘文件不动，V2.1.4 精修拍板）
    res = await api(`api/projects/${props.projectId}/folders/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "delete-note") {
    res = await api(`api/projects/${props.projectId}/notes/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "delete-project") {
    res = await api(`api/projects/${payload}`, { method: "DELETE", silent: true });
  } else if (action === "archive-project") {
    res = await api(`api/projects/${payload}`, { method: "PUT", body: JSON.stringify({ archived: true }), silent: true });
  }
  if (res?.ok) {
    if (action === "archive-project") toast("已归档");
    else if (action !== "delete-folder") toast("已删除"); // 文件夹删除成功静默（V2.1.4 精修）
    if (action === "delete-project") { emit("back"); return; }
    loadProject();
  }
  else if (res) toast(res.error || "删除失败", "error");  // 重复 toast 被 toast.js 内容去重
}
</script>

<style scoped>
.detail-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--bg);
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.detail-view::-webkit-scrollbar { display: none; }

/* ===== 面包屑（粘连布局：滚动时固定在滚动容器顶部） ===== */
.detail-crumb {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px 10px;
}
.crumb-back {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  padding: 0;
  transition: all var(--duration-fast) var(--ease-out);
}
.crumb-back:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--border);
}
.crumb-back svg { display: block; }
.crumb-sep {
  color: var(--text-tertiary);
  font-size: 12px;
  user-select: none;
}
.crumb-item {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: default;
  white-space: nowrap;
}
.crumb-root {
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}
.crumb-root:hover { color: var(--text); }
.crumb-current {
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

/* ===== 主区 ===== */
.detail-main {
  flex-shrink: 0;
  padding: 20px 24px;
  overflow: visible;
}

/* ===== Tab 区 ===== */
.tab-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  margin: 0 24px 24px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.tab-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
/* tab 风格对齐项目集 tabs：激活黑字加粗 + 淡灰背景 */
.tab-bar-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  /* V2.3 精修二批：tab 多时允许收缩并横向滚动，保底右侧工具区可见 */
  flex-shrink: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-bar-tabs::-webkit-scrollbar { display: none; }
.tab-ghost {
  opacity: 0.4;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
}
.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: grab; /* 可拖拽调序提示 */
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  font-family: inherit;
  letter-spacing: 0.02em;
  margin: 6px 2px;
  user-select: none;
  white-space: nowrap; /* 防止宽度不足时中文标签竖排 */
  flex-shrink: 0; /* 按钮不被压缩变形，超出时容器滚动 */
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
}
.tab-btn:active {
  cursor: grabbing;
}
.tab-btn:hover { background: var(--bg-hover); color: var(--text); }
.tab-btn.active {
  background: var(--bg-hover);
  color: var(--text);
  font-weight: 700;
}
.tab-btn.active svg { color: var(--text); }
.tab-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 5px;
  height: 16px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
}
.tab-btn.active .tab-pill {
  background: var(--border);
  color: var(--text);
}
/* tab 右键菜单 + 占位 */
.tab-cxt-menu {
  position: fixed;
  z-index: 4000;
  min-width: 150px;
  padding: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}
.tab-cxt-item {
  padding: 7px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.tab-cxt-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.tab-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 20px;
  color: var(--text-tertiary);
  font-size: 13px;
}
.tab-placeholder svg {
  opacity: 0.5;
}
.tab-bar-spacer { flex: 1; }
.tab-bar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-right: 6px;
  /* V2.3 精修二批：窄容器不换行，允许收缩与横向滚动兜底 */
  flex-wrap: nowrap;
  flex-shrink: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-bar-right::-webkit-scrollbar { display: none; }
/* 窄视口：tab 只留图标（文字隐藏） */
.tab-bar.compact .tab-label { display: none; }
.tab-bar.compact .tab-btn { padding: 7px 9px; }
/* 更窄：右侧仅保留新建按钮，其余工具/搜索隐藏 */
.tab-bar.mini .tab-bar-right > :not(.header-btn-primary) { display: none; }
.tab-bar.mini .tab-bar-tabs { flex: 1; min-width: 0; }
/* 任务排序下拉（V2.1.2，对齐 tab-bar 31px 高度，与方案/审计筛选下拉一致） */
.sort-select {
  width: 100px;
  flex-shrink: 0;
}
.sort-select :deep(.el-select__wrapper) {
  min-height: 31px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}
.sort-select :deep(.el-select__selected-item) {
  font-size: 12px;
  font-weight: 600;
}
.sort-opt-tip {
  float: right;
  color: var(--text-tertiary);
  font-size: 11px;
  margin-left: 10px;
}
.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg-card);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
  font-family: inherit;
  letter-spacing: 0.01em;
  /* V2.3 精修二批：文字不折行、不被压缩，窄容器时工具区整体横向滚动 */
  white-space: nowrap;
  flex-shrink: 0;
}
.header-btn:hover {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}
.header-btn-primary {
  background: var(--text);
  color: var(--bg-card);
  border: 1px solid var(--text);
  box-shadow: var(--shadow-sm);
}
.header-btn-primary:hover {
  background: var(--accent-hover) !important;
  border-color: var(--accent-hover) !important;
  color: var(--bg-card) !important;
  box-shadow: var(--shadow-md);
}

.task-search {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
}
/* 方案状态筛选下拉（tab 栏，对比按钮左侧），高度与两侧按钮对齐（约 31px） */
.plan-status-select {
  width: 104px;
  flex-shrink: 0;
}
.plan-status-select :deep(.el-select__wrapper) {
  min-height: 31px;
  border-radius: var(--radius-sm);
}
/* 审计筛选（tab 栏右上角）：行为下拉 + 日期范围选择器 */
.audit-filter-action {
  width: 130px;
  flex-shrink: 0;
}
.audit-filter-action :deep(.el-select__wrapper) {
  min-height: 31px;
  border-radius: var(--radius-sm);
}
.audit-filter-range {
  width: 230px;
  flex-shrink: 0;
}
.audit-filter-range :deep(.el-input__wrapper) {
  height: 31px !important;
  min-height: 31px !important;
}
.audit-filter-range :deep(.el-range-input) {
  font-size: 12px;
}
.audit-filter-range :deep(.el-range-separator) {
  font-size: 12px;
  color: var(--text-tertiary);
}
.task-search-icon {
  position: absolute;
  left: 9px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.task-search-input {
  padding: 6px 26px 6px 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  font-family: inherit;
  font-weight: 600;
  /* V2.3 精修二批：允许收缩（窄容器工具区不换行，min-width 兜底不撑破） */
  width: 160px;
  min-width: 56px;
  transition: all var(--duration-fast) var(--ease-out);
}
.task-search-input::placeholder { color: var(--text-tertiary); font-weight: 500; }
.task-search-input:hover { border-color: var(--border); }
.task-search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--bg-hover); width: 200px; }
.task-search-clear {
  position: absolute;
  right: 6px;
  width: 16px; height: 16px;
  border: none;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
}
.task-search-clear:hover { background: var(--border); color: var(--text); }

.tab-content {
  padding: 20px;
  background: var(--bg-card);
  min-height: 300px;
}
.task-calendar-tab {
  height: 620px; /* 固定高度：日历 tab 的 CalendarWidget 是 flex 布局（.cal-widget flex:1），需要父容器有确定高度才能铺满 */
  display: flex;
  flex-direction: column;
}
</style>
