// 会话关联（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createSessionsModule(ctx) {
  const { db, parseSessionIds, logAudit } = ctx;
  // ===== 会话关联（V2.0 S7） =====

  /**
   * 读取项目关联的会话 ID 数组（内部共享）
   * 非法 JSON（脏数据）兑底返回 []；项目不存在抛错
   * @param {string} projectId
   * @returns {string[]}
   */
  function getProjectSessionIds(projectId) {
    const row = db.prepare("SELECT session_ids FROM projects WHERE id = ?").get(projectId);
    if (!row) throw new Error(`项目 ${projectId} 不存在`);
    return parseSessionIds(row.session_ids);
  }

  /**
   * 关联会话到项目：向 session_ids 追加（去重，已存在则跳过）
   * @param {string} projectId
   * @param {string} sessionId
   * @returns {string[]} 关联后的会话 ID 数组
   */
  function linkProjectSession(projectId, sessionId) {
    if (!sessionId || typeof sessionId !== "string") throw new Error("sessionId 不能为空");
    // P2-4：长度上限 + 字符集白名单，与「短 id 约定」对齐，脏数据尽早暴露
    if (sessionId.length > 128) throw new Error("sessionId 过长（上限 128 字符）");
    if (!/^[A-Za-z0-9._:-]+$/.test(sessionId)) throw new Error("sessionId 含非法字符（仅支持字母/数字/-_.:）");
    const ids = getProjectSessionIds(projectId);
    if (!ids.includes(sessionId)) {
      ids.push(sessionId);
      db.prepare("UPDATE projects SET session_ids = ? WHERE id = ?").run(JSON.stringify(ids), projectId);
      logAudit(projectId, "关联会话", "project", projectId, null, JSON.stringify({ sessionId }));
    }
    return ids;
  }

  /**
   * 列出项目关联的会话 ID 数组
   * @param {string} projectId
   * @returns {string[]}
   */
  function listProjectSessions(projectId) {
    return getProjectSessionIds(projectId);
  }

  /**
   * 解除项目与会话的关联：从 session_ids 移除（不存在则原样返回）
   * @param {string} projectId
   * @param {string} sessionId
   * @returns {string[]} 解除后的会话 ID 数组
   */
  function unlinkProjectSession(projectId, sessionId) {
    if (!sessionId || typeof sessionId !== "string") throw new Error("sessionId 不能为空");
    const ids = getProjectSessionIds(projectId);
    const next = ids.filter((s) => s !== sessionId);
    if (next.length !== ids.length) {
      db.prepare("UPDATE projects SET session_ids = ? WHERE id = ?").run(JSON.stringify(next), projectId);
      logAudit(projectId, "解除会话关联", "project", projectId, JSON.stringify({ sessionId }), null);
    }
    return next;
  }
  return {
    getProjectSessionIds,
    linkProjectSession,
    listProjectSessions,
    unlinkProjectSession,
  };
}
