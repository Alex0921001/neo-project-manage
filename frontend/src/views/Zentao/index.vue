<template>
  <div class="zentao-view">
    <div class="section-header">
      <h2>🐞 禅道 Bug</h2>
      <button class="btn-icon" title="刷新" :disabled="loading" @click="load">
        <svg :class="{ spinning: loading }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 未配置 -->
    <div v-else-if="unconfigured" class="empty-state">
      <p>🔌 尚未配置禅道连接</p>
      <p class="hint">请对我说：<em>"配置禅道，地址是 xxx，账号 xxx，密码 xxx"</em></p>
    </div>

    <!-- 空列表 -->
    <div v-else-if="bugs.length === 0" class="empty-state">
      <p>暂无指派给你的 Bug</p>
    </div>

    <!-- Bug 列表 -->
    <div v-else class="bug-list">
      <div
        v-for="bug in bugs"
        :key="bug.id"
        class="bug-item"
      >
        <span class="bug-id">#{{ bug.id }}</span>
        <span class="bug-title">{{ bug.title }}</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-bar">{{ error }}</div>

    <!-- 底部统计 -->
    <div v-if="bugCount > 0 && !error" class="bug-footer">
      共 {{ bugCount }} 个 Bug
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api, reportHeight } from "../../api.js";

const bugs = ref([]);
const loading = ref(false);
const unconfigured = ref(false);
const error = ref("");
const bugCount = computed(() => bugs.value.length);

async function load() {
  loading.value = true;
  unconfigured.value = false;
  error.value = "";
  try {
    const res = await api("api/zentao/bugs");
    if (res?.ok) {
      bugs.value = res.data || [];
      if (res.warning) {
        error.value = res.warning;
      }
    } else if (res?.error?.includes("未配置")) {
      unconfigured.value = true;
    } else {
      error.value = res?.error || "加载失败";
    }
  } catch (err) {
    error.value = "网络错误";
    console.error("加载 ZenTao Bug 失败:", err);
  } finally {
    loading.value = false;
    reportHeight();
  }
}

onMounted(() => {
  load();
});
</script>

<style scoped>
.zentao-view {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

:deep(.section-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
:deep(.section-header h2) {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.hint em {
  font-style: italic;
  color: var(--accent);
}

.error-bar {
  margin-top: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: oklch(0.5 0.18 30);
  background: oklch(0.95 0.04 30 / 0.3);
  border-radius: var(--radius-sm);
}

.bug-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bug-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
  cursor: default;
}
.bug-item:hover {
  background: var(--bg-hover);
}

.bug-id {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  min-width: 56px;
}

.bug-title {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
}

.bug-footer {
  margin-top: 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border-light);
}

.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
