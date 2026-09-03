// 版本管理（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createVersionsModule(ctx) {
  const { db, shortId } = ctx;
  const logAudit = (...a) => ctx.logAudit(...a);
  const updatePlan = (...a) => ctx.updatePlan(...a);
  const updateRequirement = (...a) => ctx.updateRequirement(...a);
  // ===== 版本管理（V2.6，versions 表：需求/方案共用）=====

  const VERSION_KEEP = 50; // 每 target 保留最近 50 版

  /**
   * 存一版快照（保存后的状态）。仅内容实际变化时由调用方触发；创建时存 v1。
   * @param {string} projectId
   * @param {'plan'|'requirement'} targetType
   * @param {string} targetId
   * @param {{title:string, content:string, extra?:object}} snap
   * @param {string} author
   * @param {string} [createdAtOverride] 基线版本时间戳（补历史基线时用对象创建时间）
   */
  function saveVersion(projectId, targetType, targetId, snap, author = null, createdAtOverride = null) {
    const row = db.prepare(
      "SELECT MAX(version_no) AS maxNo FROM versions WHERE target_type = ? AND target_id = ?"
    ).get(targetType, targetId);
    const no = (row?.maxNo || 0) + 1;
    db.prepare(`
      INSERT INTO versions (id, project_id, target_type, target_id, version_no, title, content, extra_json, author, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shortId(), projectId, targetType, targetId, no,
      snap.title || "", snap.content || "",
      snap.extra ? JSON.stringify(snap.extra) : null,
      author, createdAtOverride || new Date().toISOString()
    );
    // 容量清理：超出保留数删最旧（按 version_no 升序）
    db.prepare(`
      DELETE FROM versions
      WHERE target_type = ? AND target_id = ? AND version_no <= ?
    `).run(targetType, targetId, no - VERSION_KEEP);
  }

  /**
   * 版本功能上线前已存在的对象：首次修改时先补一版「修改前基线」
   * （时间戳用对象创建时间），让第一次修改就能看到 改前 vs 改后 的对比
   */
  function ensureBaselineVersion(projectId, targetType, targetId, cur, extra) {
    const has = db.prepare(
      "SELECT 1 FROM versions WHERE target_type = ? AND target_id = ? LIMIT 1"
    ).get(targetType, targetId);
    if (has) return;
    if (targetType === "plan") {
      saveVersion(projectId, targetType, targetId,
        { title: cur.title, content: cur.content, extra: { status: cur.status } }, null, cur.created_at);
    } else {
      saveVersion(projectId, targetType, targetId,
        { title: cur.name, content: cur.description, extra: { status: cur.status, priority: cur.priority } }, null, cur.created_at);
    }
  }

  /** 对象删除时级联清版本（应用层） */
  function deleteVersionsFor(projectId, targetType, targetId) {
    db.prepare("DELETE FROM versions WHERE target_type = ? AND target_id = ?").run(targetType, targetId);
  }

  /**
   * 版本列表（新→旧，含内容快照，前端做对比）
   * @returns {{ total: number, items: Array<{id, targetType, targetId, versionNo, title, content, extra, author, label, createdAt}> }}
   */
  function listVersions(projectId, targetType, targetId) {
    if (!["plan", "requirement"].includes(targetType)) throw new Error(`不支持的版本对象类型: ${targetType}`);
    const rows = db.prepare(
      "SELECT * FROM versions WHERE project_id = ? AND target_type = ? AND target_id = ? ORDER BY version_no DESC"
    ).all(projectId, targetType, targetId);
    return {
      total: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        versionNo: r.version_no,
        title: r.title,
        content: r.content,
        extra: r.extra_json ? JSON.parse(r.extra_json) : null,
        author: r.author || null,
        label: r.label || null,
        createdAt: r.created_at,
      })),
    };
  }

  /**
   * 还原到历史版本：旧内容作为新版本存入（版本链不断，可随时再还原）
   * 走 updatePlan / updateRequirement 复用其校验、审计与自动存版逻辑
   */
  function restoreVersion(projectId, targetType, targetId, versionId) {
    const row = db.prepare(
      "SELECT * FROM versions WHERE id = ? AND project_id = ? AND target_type = ? AND target_id = ?"
    ).get(versionId, projectId, targetType, targetId);
    if (!row) throw new Error(`版本 ${versionId} 不存在`);
    const extra = row.extra_json ? JSON.parse(row.extra_json) : {};
    if (targetType === "plan") {
      updatePlan(projectId, targetId, { title: row.title, content: row.content, status: extra.status });
    } else {
      updateRequirement(projectId, targetId, { name: row.title, description: row.content, priority: extra.priority });
    }
    logAudit(projectId, "还原版本", "version", versionId,
      null, JSON.stringify({ targetType, targetId, versionNo: row.version_no }));
    return true;
  }

  /** 给版本补备注（「标记重要」） */
  function setVersionLabel(projectId, versionId, label) {
    const row = db.prepare("SELECT id FROM versions WHERE id = ? AND project_id = ?").get(versionId, projectId);
    if (!row) throw new Error(`版本 ${versionId} 不存在`);
    db.prepare("UPDATE versions SET label = ? WHERE id = ?").run(label ? String(label).slice(0, 60) : null, versionId);
    return true;
  }

  return {
    saveVersion,
    ensureBaselineVersion,
    deleteVersionsFor,
    listVersions,
    restoreVersion,
    setVersionLabel,
  };
}
