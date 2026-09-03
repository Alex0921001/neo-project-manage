// 消息中心（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createMessagesModule(ctx) {
  const { db, shortId, localToday, addDays, getMessageConfig, listProjects, summarizeProject, logAudit } = ctx;
  // ===== 消息中心（V2.3 R1）=====
  // 惰性扫描：打开消息中心 / 调用工具 / 查未读数时触发，按（type + batch_key）幂等去重

  /**
   * 幂等写入一条消息（batch_key UNIQUE + INSERT OR IGNORE，同批次重复扫描不重复插入）
   */
  function insertMessage(msg) {
    db.prepare(`
      INSERT OR IGNORE INTO messages (id, project_id, type, title, content, ref_task_id, ref_plan_id, read, batch_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      shortId(), msg.projectId || null, msg.type, msg.title, msg.content,
      msg.refTaskId || null, msg.refPlanId || null, msg.batchKey, new Date().toISOString()
    );
  }

  /**
   * 惰性扫描生成新消息（deadline 到期提醒 + risk 风险提醒；synergy 预留骨架暂不生成）
   * - deadline：非归档项目中未完成任务 endDate 在 [今天, 今天+提前天数]（deadline_days 配置，默认 3）
   *   → 全部项目聚合 1 条（project_id=NULL）；当日聚合已存在则短路跳过（快照语义，同 batch_key 幂等）
   *   开关 deadline_enabled=false 时不生成（历史消息保留）
   * - risk：仅非归档且原始 status∈{进行中,待开始} 的项目 → summarizeProject 取 level∈{high,medium}
   *   → 跨项目聚合 1 条（project_id=NULL，batch_key=risk|YYYY-MM-DD）；当日已存在则短路跳过
   *   （避免每次打开消息中心全项目 summarizeProject 的性能开销）；开关 risk_enabled=false 时不生成
   * 窗口内无数据则不生成（消息中心保持干净）
   */
  function scanMessages() {
    const today = localToday();
    const cfg = getMessageConfig();

    // —— deadline 聚合（短路：当日快照已生成或当日批次已被用户删除则跳过）——
    const deadlineBatchKey = `deadline|${today}`;
    const hasDeadline = db.prepare("SELECT 1 FROM messages WHERE batch_key = ?").get(deadlineBatchKey)
      || db.prepare("SELECT 1 FROM deleted_batch_keys WHERE batch_key = ?").get(deadlineBatchKey);
    if (cfg.deadlineEnabled && !hasDeadline) {
      const end = addDays(today, cfg.deadlineDays);
      const tasks = db.prepare(`
        SELECT t.id, t.name, t.end_date, t.project_id, p.name AS project_name
        FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.done = 0 AND p.archived = 0 AND t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        ORDER BY t.end_date, t.name
      `).all(today, end);
      if (tasks.length > 0) {
        const projectCount = new Set(tasks.map((t) => t.project_id)).size;
        insertMessage({
          projectId: null, type: "deadline",
          title: `${projectCount} 个项目共 ${tasks.length} 条任务即将到期`,
          content: tasks.map((t) => `【${t.project_name}】${t.name}（${t.end_date}）`).join("\n"),
          refTaskId: null, refPlanId: null,
          batchKey: `deadline|${today}`,
        });
      }
    }

    // —— risk 聚合（跨项目，PM 拍板：与 deadline 口径一致，所有项目中高风险一天一条；短路跳过已生成或已删除）——
    const riskBatchKey = `risk|${today}`;
    const hasRisk = db.prepare("SELECT 1 FROM messages WHERE batch_key = ?").get(riskBatchKey)
      || db.prepare("SELECT 1 FROM deleted_batch_keys WHERE batch_key = ?").get(riskBatchKey);
    if (cfg.riskEnabled && !hasRisk) {
      const riskItems = [];
      for (const p of listProjects()) {
        if (p.archived) continue;
        if (p.status !== "进行中" && p.status !== "待开始") continue;
        const sum = summarizeProject(p.id);
        if (!sum) continue;
        const risks = (sum.risks || []).filter((r) => r.level === "high" || r.level === "medium");
        if (risks.length === 0) continue;
        riskItems.push({ projectId: p.id, projectName: p.name, risks });
      }
      if (riskItems.length > 0) {
        const riskCount = riskItems.reduce((n, x) => n + x.risks.length, 0);
        insertMessage({
          projectId: null, type: "risk",
          title: `${riskItems.length} 个项目共 ${riskCount} 条风险提醒`,
          content: riskItems
            .map((x) => `【${x.projectName}】${x.risks.map((r) => `[${r.level === "high" ? "高" : "中"}] ${r.desc}`).join("；")}`)
            .join("\n"),
          refTaskId: null, refPlanId: null,
          batchKey: `risk|${today}`,
        });
      }
    }
    // synergy（协同通知）：V2.3 预留骨架，当前不生成消息
  }

  /**
   * 列出消息（先惰性扫描，再分页）
   * @param {{projectId?: string, type?: string, limit?: number, offset?: number}} [opts]
   * @returns {{total: number, unread: number, items: Array<{id, projectId, type, title, content, refTaskId, refPlanId, read, createdAt}>}}
   */
  function listMessages(opts = {}) {
    scanMessages();
    const { projectId, type } = opts;
    const limit = Number.isInteger(opts.limit) && opts.limit >= 1 ? Math.min(opts.limit, 100) : 20;
    const offset = Number.isInteger(opts.offset) && opts.offset >= 0 ? opts.offset : 0;
    const where = [];
    const params = [];
    if (projectId) { where.push("project_id = ?"); params.push(projectId); }
    if (type) { where.push("type = ?"); params.push(type); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) c FROM messages ${whereSql}`).get(...params).c;
    const unreadSql = where.length ? `${whereSql} AND read = 0` : "WHERE read = 0";
    const unread = db.prepare(`SELECT COUNT(*) c FROM messages ${unreadSql}`).get(...params).c;
    const rows = db.prepare(`
      SELECT id, project_id, type, title, content, ref_task_id, ref_plan_id, read, created_at
      FROM messages ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    return {
      total,
      unread,
      items: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        type: r.type,
        title: r.title,
        content: r.content,
        refTaskId: r.ref_task_id,
        refPlanId: r.ref_plan_id,
        read: !!r.read,
        createdAt: r.created_at,
      })),
    };
  }

  /**
   * 标记消息已读（批量）
   * @param {string[]} ids
   * @returns {{updated: number}}
   */
  function markMessageRead(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    // read=0 过滤：仅更新未读行，重复标记幂等（changes 反映真实变化数）
    const placeholders = ids.map(() => "?").join(",");
    const r = db.prepare(`UPDATE messages SET read = 1 WHERE id IN (${placeholders}) AND read = 0`).run(...ids);
    return { updated: r.changes };
  }

  /**
   * 删除单条消息（V2.3.1 补审：按消息所属项目留痕，project_id 为空归 NULL 不进项目）
   * @param {string} id
   * @returns {boolean}
   */
  function deleteMessage(id) {
    const row = db.prepare("SELECT id, project_id, title, batch_key FROM messages WHERE id = ?").get(String(id || ""));
    const r = db.prepare("DELETE FROM messages WHERE id = ?").run(String(id || ""));
    if (r.changes === 0) throw new Error(`消息 ${id} 不存在`);
    // 删除抑制：记住被删消息的批次，当天扫描不再重新生成同一条（batch_key 含日期，次日自动过期）
    if (row?.batch_key) {
      const now = new Date().toISOString();
      db.prepare("INSERT OR REPLACE INTO deleted_batch_keys (batch_key, deleted_at) VALUES (?, ?)")
        .run(row.batch_key, now);
      db.prepare("DELETE FROM deleted_batch_keys WHERE deleted_at < ?").run(
        new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      );
    }
    if (row) logAudit(row.project_id || null, "删除消息", "message", row.id,
      JSON.stringify({ title: row.title }), null);
    return true;
  }

  /**
   * 未读消息数（先惰性扫描保证新鲜）
   * @param {string} [projectId] 不传=全部项目
   * @returns {number}
   */
  function getMessageUnreadCount(projectId) {
    scanMessages();
    const c = projectId
      ? db.prepare("SELECT COUNT(*) c FROM messages WHERE read = 0 AND project_id = ?").get(projectId).c
      : db.prepare("SELECT COUNT(*) c FROM messages WHERE read = 0").get().c;
    return c;
  }
  return {
    insertMessage,
    scanMessages,
    listMessages,
    markMessageRead,
    deleteMessage,
    getMessageUnreadCount,
  };
}
