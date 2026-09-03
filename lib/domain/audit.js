// 审计日志（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createAuditModule(ctx) {
  const { db, shortId } = ctx;
  const markFtsDirty = (...a) => ctx.markFtsDirty(...a);
  // ===== 审计日志（V2.1 审计追踪）=====

  /**
   * 审计内容文本化：去 HTML 标签 + 压缩空白 + 截断（防审计表膨胀）
   * @param {*} s
   * @param {number} [max] 最大字符数（默认 120）
   * @returns {string}
   */
  function auditText(s, max = 120) {
    const t = String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }

  /**
   * 写入审计日志（V2.1 审计追踪）
   * - 写操作成功后调用；只记录，绝不改变业务结果
   * - 写入失败静默降级（不影响业务：审计是旁路能力）
   * - projectId 可空：全局成员 / 项目集操作无项目归属，归 NULL（不会出现在任何项目内）
   * @param {string|null} projectId 归属项目（可空）
   * @param {string} action 行为描述（中文动作名，如「创建项目」「更新任务」）
   * @param {string} targetType project/task/annotation/file/note/member/project_set
   * @param {string} targetId 目标 ID
   * @param {string|null} oldValue 旧值 JSON 片段（可空）
   * @param {string|null} newValue 新值 JSON 片段（可空）
   */
  function logAudit(projectId, action, targetType, targetId, oldValue, newValue) {
    if (!action || !targetType) return;
    try {
      db.prepare(`
        INSERT INTO audit_logs (id, project_id, action, target_type, target_id, old_value, new_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        shortId(),
        projectId || null,
        action,
        targetType,
        targetId || null,
        oldValue ?? null,
        newValue ?? null,
        new Date().toISOString()
      );
    } catch (e) {
      console.warn("[audit] 审计写入失败（不影响业务）:", e.message);
    }
    // V2.3 R2：写操作统一标脏对应项目，搜索时增量重建 FTS 索引。
    // 放在 try 之外：审计失败也必须标脏，保证 FTS 一致性（markFtsDirty 自身失败静默）。
    // logAudit 与业务写在同一连接上，即使调用方在事务内也无不一致问题。
    markFtsDirty(projectId);
  }

  return {
    auditText,
    logAudit,
  };
}
