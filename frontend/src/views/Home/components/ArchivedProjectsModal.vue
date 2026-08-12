<template>
  <el-dialog
    :model-value="show"
    title="已归档项目"
    width="920px"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="(v) => emit('update:modelValue', v)"
    @close="emit('close')"
  >
    <!-- 搜索栏：项目名称 + 起止日期 -->
    <div class="arch-search">
      <div class="arch-search-name">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
        <input v-model="kw" class="arch-search-input" placeholder="搜索项目名称..." />
        <button v-if="kw" class="arch-search-clear" @click="kw = ''" title="清空">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
        </button>
      </div>
      <el-select v-model="filterSetId" placeholder="项目集" clearable style="width: 130px">
        <el-option label="未归类" value="__none__" />
        <el-option v-for="s in sets" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 110px">
        <el-option v-for="st in STATUS_OPTIONS" :key="st" :label="st" :value="st" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 240px"
        clearable
      />
      <span class="arch-count">{{ filtered.length }} 条</span>
    </div>

    <!-- 表格（分页，一屏展示；边框 + 列宽收敛避免横向滚动） -->
    <el-table :data="pagedItems" border style="width: 100%" empty-text="没有匹配的已归档项目">
      <el-table-column label="项目名称" min-width="180">
        <template #default="{ row }">
          <span class="arch-name" :title="row.name" @click="emit('open', row.id)">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <span :class="['arch-status', `status-${statusKey(row.status)}`]">
            <span class="status-dot"></span>
            {{ row.status || '待开始' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="起止日期" width="200" align="center">
        <template #default="{ row }">
          <span class="arch-dates">{{ row.planStart || '—' }} ~ {{ row.planEnd || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="项目集" width="100">
        <template #default="{ row }">
          <span class="arch-set">{{ getSetName(row.projectSetId) || '未归类' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="归档时间" width="100" align="center">
        <template #default="{ row }">
          <span class="arch-at">{{ formatDate(row.archivedAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <button class="arch-restore" @click="emit('restore', row)" title="取消归档">恢复</button>
        </template>
      </el-table-column>
    </el-table>

    <div class="arch-pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filtered.length"
        layout="total, prev, pager, next"
        background
        small
      />
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  projects: { type: Array, default: () => [] },
  sets: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue", "close", "open", "restore"]);

const kw = ref("");
const dateRange = ref(null);
const filterSetId = ref("");
const filterStatus = ref("");
const STATUS_OPTIONS = ["待开始", "进行中", "已完成", "已取消"];
// 分页：一屏展示，翻页查看
const page = ref(1);
const pageSize = 10;

// 打开时清空筛选并回到第一页
watch(() => props.show, (v) => {
  if (v) { kw.value = ""; dateRange.value = null; filterSetId.value = ""; filterStatus.value = ""; page.value = 1; }
});

// 筛选条件变化时回到第一页
watch([kw, dateRange, filterSetId, filterStatus], () => { page.value = 1; });

// 过滤：名称模糊 + 起止日期交集
const filtered = computed(() => {
  const q = kw.value.trim().toLowerCase();
  const [rs, re] = dateRange.value || [null, null];
  return props.projects.filter((p) => {
    if (q && !(p.name || "").toLowerCase().includes(q)) return false;
    // 项目集筛选（__none__ = 未归类）
    if (filterSetId.value) {
      const setVal = p.projectSetId || "";
      if (filterSetId.value === "__none__" ? setVal !== "" : setVal !== filterSetId.value) return false;
    }
    // 状态筛选（已归档项目保留原状态）
    if (filterStatus.value && (p.status || "") !== filterStatus.value) return false;
    if (rs && re) {
      const ps = p.planStart || "";
      const pe = p.planEnd || "";
      if (!ps && !pe) return false;
      const startOk = !ps || ps <= re;
      const endOk = !pe || pe >= rs;
      if (!startOk || !endOk) return false;
    }
    return true;
  });
});

// 当前页数据
const pagedItems = computed(() => {
  const start = (page.value - 1) * pageSize;
  return filtered.value.slice(start, start + pageSize);
});

function getSetName(projectSetId) {
  if (!projectSetId) return "";
  const s = props.sets.find((x) => x.id === projectSetId);
  return s ? s.name : "";
}

function statusKey(s) {
  return ({ "待开始": "todo", "进行中": "doing", "已完成": "done", "已延期": "delay", "已取消": "cancel" })[s] || "todo";
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
</script>

<style scoped>
.arch-search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.arch-search-name {
  position: relative;
  flex: 1;
  max-width: 260px;
}
.arch-search-name svg {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
}
.arch-search-input {
  width: 100%;
  padding: 7px 30px 7px 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.arch-search-input:focus { border-color: var(--text); }
.arch-search-input::placeholder { color: var(--text-tertiary); }
.arch-search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  border: none;
  background: var(--bg-hover);
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.arch-search-clear:hover { background: var(--border); color: var(--text); }
.arch-count {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.arch-name {
  color: var(--link);
  cursor: pointer;
  font-weight: 500;
  transition: text-decoration var(--duration-fast) var(--ease-out);
}
/* 悬停仅显示下划线提示可点击，颜色不变 */
.arch-name:hover {
  text-decoration: underline;
}
.arch-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.status-todo { color: var(--status-todo-text); }
.status-doing { color: var(--status-doing-text); }
.status-done { color: var(--status-done-text); }
.status-delay { color: var(--status-delay-text); }
.status-cancel { color: var(--status-cancel-text); }
.arch-dates { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.arch-set { font-size: 12px; color: var(--text-secondary); }
.arch-at { font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.arch-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.arch-restore {
  padding: 3px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.arch-restore:hover {
  background: var(--bg-hover);
  color: var(--text);
  border-color: var(--text-secondary);
}
</style>
