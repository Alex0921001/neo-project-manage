// status 计算（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createCoreModule(ctx) {
  const { db, escapeLike } = ctx;
  function healDanglingReferences() {
    const danglingPlans = db.prepare(`
      SELECT p.id FROM plans p
      WHERE p.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = p.task_id)
    `).all();
    const clearPlanTask = db.prepare("UPDATE plans SET task_id = NULL WHERE id = ?");
    const danglingReqPlans = db.prepare(`
      SELECT rp.requirement_id, rp.plan_id FROM requirement_plans rp
      WHERE NOT EXISTS (SELECT 1 FROM requirements r WHERE r.id = rp.requirement_id)
         OR NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = rp.plan_id)
    `).all();
    const delReqPlan = db.prepare("DELETE FROM requirement_plans WHERE requirement_id = ? AND plan_id = ?");
    const danglingTaskPlans = db.prepare(`
      SELECT tp.task_id, tp.plan_id FROM task_plans tp
      WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = tp.task_id)
         OR NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = tp.plan_id)
    `).all();
    const delTaskPlan = db.prepare("DELETE FROM task_plans WHERE task_id = ? AND plan_id = ?");
    if (danglingPlans.length || danglingReqPlans.length || danglingTaskPlans.length) {
      db.transaction(() => {
        for (const r of danglingPlans) clearPlanTask.run(r.id);
        for (const r of danglingReqPlans) delReqPlan.run(r.requirement_id, r.plan_id);
        for (const r of danglingTaskPlans) delTaskPlan.run(r.task_id, r.plan_id);
      })();
      console.warn(`[data] 数据自愈：清理 ${danglingPlans.length} 个方案悬空 task_id、${danglingReqPlans.length} 条悬空需求-方案关联、${danglingTaskPlans.length} 条悬空任务-方案关联`);
    }
  }

  /**
   * 按 ID 解析单行（V2.2 R11：完整 ID 或唯一前缀，projectId 可空=全局查询）
   * 匹配顺序：精确命中 → 唯一前缀命中 → 多候选抛错（列出候选供调用方用完整 ID 重试）→ 无命中返回 null
   * @param {string} table 表名（仅内部字面量传入，非用户输入，无注入风险）
   * @param {string} idColumn 主键列名（内部字面量）
   * @param {string} projectColumn 项目归属列名（内部字面量）
   * @param {string|null} projectId 项目 ID（null=不按项目过滤）
   * @param {string} id 完整 ID 或前缀
   * @param {string} label 实体中文名（错误提示用）
   * @param {(row:any)=>string} nameOf 从行取展示名（候选提示用）
   * @returns {any|null}
   */
  function resolveRowById(table, idColumn, projectColumn, projectId, id, label, nameOf) {
    const q = String(id ?? "").trim();
    if (!q) throw new Error(`${label} ID 不能为空`);
    const esc = escapeLike(q);
    let rows;
    if (projectId) {
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ? AND ${projectColumn} = ?`).all(q, projectId);
      if (rows.length === 0) {
        rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} LIKE ? ESCAPE '\\' AND ${projectColumn} = ?`).all(`${esc}%`, projectId);
      }
    } else {
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).all(q);
      if (rows.length === 0) {
        rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} LIKE ? ESCAPE '\\'`).all(`${esc}%`);
      }
    }
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) {
      const cands = rows.map((r) => `${r[idColumn]}（${nameOf(r)}）`).join("、");
      throw new Error(`${label} ID「${q}」前缀匹配到 ${rows.length} 个${label}，请用完整 ID 指定：${cands}`);
    }
    return null;
  }

  healDanglingReferences();

  return {
    healDanglingReferences,
    resolveRowById,
  };
}
