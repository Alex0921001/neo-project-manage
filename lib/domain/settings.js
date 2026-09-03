// 设置（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createSettingsModule(ctx) {
  const { db } = ctx;
  // ===== 设置（V2.3 精修 #7：消息提醒配置等） =====

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
   * 读消息提醒配置（V2.3 精修 #7）：
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
  return {
    getSetting,
    setSetting,
    getMessageConfig,
    updateMessageConfig,
  };
}
