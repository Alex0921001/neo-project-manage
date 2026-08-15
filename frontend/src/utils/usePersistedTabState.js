import { reactive, watch } from "vue";

export const STATE_VERSION = "v1";

/**
 * R13：项目详情五 tab 筛选/排序状态持久化 composable。
 * 用法：
 *   const st = usePersistedTabState(() => `${projectId}-requirements`, { search: "", status: "全部", sort: "default" });
 *   const { search, status, sort } = toRefs(st); // 直接 v-model 绑定
 *
 * 行为约定：
 * - 存储键：neo-pm-ui-state-{STATE_VERSION}-{getKey()}，版本前缀防结构变更读脏数据
 * - JSON 结构：{ 字段..., version, updatedAt }
 * - 读取：JSON 解析失败 / 版本不符 / localStorage 禁用 → 静默降级默认值
 * - 写入：字段变化后防抖 debounceMs（默认 300ms）
 * - 字段按 defaults 白名单过滤：存档中多出的字段忽略，缺失的字段回落默认值
 *   （对应「筛选值对应选项被删」静默降级默认值，不报错）
 * - getKey 依赖响应式值（如 props.projectId）时，键变化自动重新加载（切换项目互不串状态）
 *
 * @param {() => string} getKey 存储键尾段生成函数（读取响应式值以支持切换项目）
 * @param {object} defaults 默认值（同时充当结构白名单）
 * @param {number} debounceMs 防抖写延迟
 */
export function usePersistedTabState(getKey, defaults, debounceMs = 300) {
  const state = reactive({ ...defaults });
  let stopWatch = null;
  let timer = null;
  let currentKey = "";

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (!obj || obj.version !== STATE_VERSION) return {};
      return obj;
    } catch {
      return {};
    }
  }

  function load() {
    // 切键前先 flush 旧键待写的防抖修改（避免旧项目最后修改丢失），再清 timer 切换
    if (timer) {
      clearTimeout(timer);
      timer = null;
      if (currentKey) write();
    }
    const key = `neo-pm-ui-state-${STATE_VERSION}-${getKey()}`;
    currentKey = key;
    const saved = read(key);
    stopWatch?.(); // 暂停监听，避免恢复赋值触发写回
    for (const k of Object.keys(defaults)) state[k] = defaults[k];
    for (const k of Object.keys(defaults)) {
      if (saved[k] !== undefined) state[k] = saved[k];
    }
    stopWatch = watch(state, schedule);
  }

  function write() {
    try {
      localStorage.setItem(currentKey, JSON.stringify({ ...state, version: STATE_VERSION, updatedAt: Date.now() }));
    } catch {
      /* localStorage 禁用/超限：静默降级会话内状态，不崩溃 */
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(write, debounceMs);
  }

  load();
  watch(getKey, load); // getKey 依赖的响应式值变化（切换项目）→ 重新加载对应项目的存档

  return state;
}
