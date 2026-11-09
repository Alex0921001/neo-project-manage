// 设置
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import

/** 项目状态分组键（7 个）：已延期不占键，随「待开始」组展示与计数 */
export const STATUS_GROUP_KEYS = ["预开始", "待开始", "进行中", "预结束", "已完成", "已取消", "已归档"];
/** 分组数量可选档位；"all" 表示全部 */
const STATUS_GROUP_LIMITS = [5, 10, 15, 20];
const ARCHIVED_GROUP = "已归档";

/** 分组配置默认值（新增组或旧配置缺失时回落） */
function defaultStatusGroups() {
  const visible = {};
  const limit = {};
  for (const k of STATUS_GROUP_KEYS) {
    visible[k] = k !== ARCHIVED_GROUP;
    limit[k] = k === ARCHIVED_GROUP ? 5 : "all";
  }
  return { order: [...STATUS_GROUP_KEYS], visible, limit };
}

/**
 * 归一化分组配置：脏值、缺失字段、旧配置残留键一律回落默认。
 * - order：只保留合法键并去重，缺失的按默认顺序补全
 * - visible：非布尔回落默认
 * - limit：非 5/10/15/20/"all" 回落 "all"
 * - 7 键以外的键（含旧版曾出现的「已延期」）直接丢弃
 */
export function normalizeStatusGroups(raw) {
  const def = defaultStatusGroups();
  let obj = raw;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return def;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return def;

  const seen = new Set();
  const order = [];
  if (Array.isArray(obj.order)) {
    for (const k of obj.order) {
      if (STATUS_GROUP_KEYS.includes(k) && !seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  for (const k of STATUS_GROUP_KEYS) {
    if (!seen.has(k)) order.push(k);
  }

  const visible = {};
  const limit = {};
  const rawVisible = obj.visible && typeof obj.visible === "object" ? obj.visible : {};
  const rawLimit = obj.limit && typeof obj.limit === "object" ? obj.limit : {};
  for (const k of STATUS_GROUP_KEYS) {
    visible[k] = typeof rawVisible[k] === "boolean" ? rawVisible[k] : def.visible[k];
    const l = rawLimit[k];
    limit[k] = l === "all" || STATUS_GROUP_LIMITS.includes(l) ? l : "all";
  }

  return { order, visible, limit };
}

export function createSettingsModule(ctx) {
  const { db } = ctx;
 // ===== 设置（消息提醒配置等） =====

  /**
   * 读设置（key/value 键值表）；不存在返回 fallback
   * @param {string} key
   * @param {*} [fallback]
   * @returns {string|null}
   */
  function getSetting(key, fallback = null) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(String(key));
    return row ? row.value : fallback;
  }

  /**
   * 写设置（INSERT OR REPLACE）
   * @param {string} key
   * @param {string|number|boolean} value
   * @returns {boolean}
   */
  function setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(String(key), String(value));
    return true;
  }

  /**
 * 读消息提醒配置（精修 #7）：
   * - deadlineDays：到期提醒提前天数（key: deadline_days，默认 3，范围 1-14）
   * - deadlineEnabled / riskEnabled：类型开关（key: deadline_enabled / risk_enabled，默认 true）
   * 配置值非法时回退默认（容错：手工改库/脏值不崩）
   * @returns {{deadlineDays: number, deadlineEnabled: boolean, riskEnabled: boolean}}
   */
  function getMessageConfig() {
    const rawDays = Number(getSetting("deadline_days", 3));
    const deadlineDays = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 14 ? rawDays : 3;
    const parseBool = (v, def) => {
      const s = getSetting(v);
      if (s === null) return def;
      return s === "1" || s === "true";
    };
    return {
      deadlineDays,
      deadlineEnabled: parseBool("deadline_enabled", true),
      riskEnabled: parseBool("risk_enabled", true),
    };
  }

  /**
   * 更新消息提醒配置（局部更新：传哪个改哪个；deadlineDays 校验 1-14）
   * @param {{deadlineDays?: number, deadlineEnabled?: boolean, riskEnabled?: boolean}} cfg
   * @returns {object} 更新后的完整配置
   */
  function updateMessageConfig(cfg = {}) {
    if (cfg.deadlineDays !== undefined) {
      const n = Number(cfg.deadlineDays);
      if (!Number.isInteger(n) || n < 1 || n > 14) throw new Error("deadlineDays 需为 1-14 的整数");
      setSetting("deadline_days", String(n));
    }
    if (cfg.deadlineEnabled !== undefined) setSetting("deadline_enabled", cfg.deadlineEnabled ? "1" : "0");
    if (cfg.riskEnabled !== undefined) setSetting("risk_enabled", cfg.riskEnabled ? "1" : "0");
    return getMessageConfig();
  }
  /**
   * 读项目状态分组配置（全局一份；旧配置/脏值自动归一）
   * @returns {{order: string[], visible: Record<string, boolean>, limit: Record<string, number|"all">}}
   */
  function getProjectStatusGroups() {
    return normalizeStatusGroups(getSetting("projectStatusGroups"));
  }

  /**
   * 整份覆盖写项目状态分组配置（先归一化再落库，避免半更新）
   * @param {object} cfg
   * @returns {object} 写入后的完整配置
   */
  function updateProjectStatusGroups(cfg) {
    const next = normalizeStatusGroups(cfg);
    setSetting("projectStatusGroups", JSON.stringify(next));
    return next;
  }

  return {
    getSetting,
    setSetting,
    getMessageConfig,
    updateMessageConfig,
    getProjectStatusGroups,
    updateProjectStatusGroups,
  };
}
