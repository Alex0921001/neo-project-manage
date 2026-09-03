// Members（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createMembersModule(ctx) {
  const { logAudit } = ctx;
  // ===== Members（V2.0 成员管理）=====

  /**
   * 列出全部全局成员（按 name 排序）
   * @returns {Array<{id: string, name: string, createdAt: string}>}
   */
  function listMembers() {
    return db.prepare("SELECT id, name, created_at FROM members ORDER BY name, created_at").all()
      .map((m) => ({ id: m.id, name: m.name, createdAt: m.created_at }));
  }

  /**
   * 归一化成员名：trim + 非空校验（create/rename 共用）
   * @param {*} name
   * @returns {string}
   */
  function normalizeMemberName(name) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) throw new Error("成员名称不能为空");
    return trimmed;
  }

  /**
   * 新建全局成员（trim / 非空 / 重名校验）
   * @param {string} name
   * @returns {{id: string, name: string, createdAt: string}}
   */
  function createMember(name) {
    const trimmed = normalizeMemberName(name);
    const exists = db.prepare("SELECT 1 FROM members WHERE name = ?").get(trimmed);
    if (exists) throw new Error(`成员「${trimmed}」已存在`);
    const member = { id: shortId(), name: trimmed, createdAt: new Date().toISOString().slice(0, 10) };
    db.prepare("INSERT INTO members (id, name, created_at) VALUES (?, ?, ?)").run(member.id, member.name, member.createdAt);
    logAudit(null, "创建成员", "member", member.id, null, JSON.stringify({ name: member.name }));
    return member;
  }

  /**
   * 改名（同样 trim / 非空 / 重名校验，排除自身）
   * @param {string} id
   * @param {string} name
   * @returns {{id: string, name: string, createdAt: string}}
   */
  function renameMember(id, name) {
    const cur = db.prepare("SELECT id, name FROM members WHERE id = ?").get(id);
    if (!cur) throw new Error(`成员 ${id} 不存在`);
    const trimmed = normalizeMemberName(name);
    const dup = db.prepare("SELECT 1 FROM members WHERE name = ? AND id != ?").get(trimmed, id);
    if (dup) throw new Error(`成员「${trimmed}」已存在`);
    db.prepare("UPDATE members SET name = ? WHERE id = ?").run(trimmed, id);
    if (trimmed !== cur.name) {
      logAudit(null, "更新成员", "member", id, JSON.stringify({ name: cur.name }), JSON.stringify({ name: trimmed }));
    }
    const after = db.prepare("SELECT id, name, created_at FROM members WHERE id = ?").get(id);
    return { id: after.id, name: after.name, createdAt: after.created_at };
  }

  /**
   * 删除全局成员
   * @param {string} id
   * @returns {boolean}
   */
  function deleteMember(id) {
    const row = db.prepare("SELECT name FROM members WHERE id = ?").get(id);
    const result = db.prepare("DELETE FROM members WHERE id = ?").run(id);
    if (result.changes === 0) throw new Error(`成员 ${id} 不存在`);
    if (row) logAudit(null, "删除成员", "member", id, JSON.stringify({ name: row.name }), null);
    return true;
  }

  /**
   * 聚合所有历史人名（供人员下拉补录候选）：
   * members 表 ∪ 所有 projects.members ∪ 所有 tasks.assignees（JSON 数组解析去重）
   * 历史人名仅作候选展示，不入库；按名称排序
   * @returns {string[]}
   */
  function allKnownNames() {
    const set = new Set();
    for (const m of db.prepare("SELECT name FROM members").all()) set.add(m.name);
    for (const p of db.prepare("SELECT members FROM projects").all()) {
      for (const m of parseMembers(p.members)) set.add(String(m).trim());
    }
    for (const t of db.prepare("SELECT assignees FROM tasks").all()) {
      for (const a of parseAssignees(t.assignees)) set.add(String(a).trim());
    }
    set.delete("");
    return [...set].sort((a, b) => a.localeCompare(b, "zh"));
  }
  return {
    listMembers,
    normalizeMemberName,
    createMember,
    renameMember,
    deleteMember,
    allKnownNames,
  };
}
