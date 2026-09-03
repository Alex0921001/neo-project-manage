// Project Sets（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createProjectSetsModule(ctx) {
  const { db, shortId } = ctx;
  const logAudit = (...a) => ctx.logAudit(...a);
  // ===== Project Sets =====

  function listProjectSets() {
    return db.prepare("SELECT id, name, created_at, sort FROM project_sets ORDER BY sort IS NULL, sort, created_at").all()
      .map((s) => ({ id: s.id, name: s.name, createdAt: s.created_at, sort: s.sort }));
  }

  function getProjectSet(id) {
    const s = db.prepare("SELECT id, name, created_at, sort FROM project_sets WHERE id = ?").get(id);
    return s ? { id: s.id, name: s.name, createdAt: s.created_at, sort: s.sort } : null;
  }

  function createProjectSet(data) {
    if (!data.name || !data.name.trim()) throw new Error("项目集名称不能为空");
    if (data.name.trim().length > 10) throw new Error("项目集名称最多10个字符");
    const trimmed = data.name.trim();
    const exists = db.prepare("SELECT 1 FROM project_sets WHERE name = ?").get(trimmed);
    if (exists) throw new Error(`项目集名称「${trimmed}」已存在`);
    const maxSort = db.prepare("SELECT COALESCE(MAX(sort), -1) as m FROM project_sets").get().m;
    const set = { id: shortId(), name: data.name, createdAt: new Date().toISOString().slice(0, 10), sort: maxSort + 1 };
    db.prepare("INSERT INTO project_sets (id, name, created_at, sort) VALUES (?, ?, ?, ?)").run(set.id, set.name, set.createdAt, set.sort);
    logAudit(null, "创建项目集", "project_set", set.id, null, JSON.stringify({ name: trimmed }));
    return set;
  }

  function updateProjectSet(id, data) {
    const cur = getProjectSet(id);
    if (!cur) return null;
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("项目集名称不能为空");
      if (data.name.trim().length > 10) throw new Error("项目集名称最多10个字符");
      const trimmed = data.name.trim();
      const exists = db.prepare("SELECT 1 FROM project_sets WHERE name = ? AND id != ?").get(trimmed, id);
      if (exists) throw new Error(`项目集名称「${trimmed}」已被其他项目集使用`);
      db.prepare("UPDATE project_sets SET name = ? WHERE id = ?").run(data.name, id);
      if (trimmed !== cur.name) {
        logAudit(null, "更新项目集", "project_set", id, JSON.stringify({ name: cur.name }), JSON.stringify({ name: trimmed }));
      }
    }
    return getProjectSet(id);
  }

  function deleteProjectSet(id) {
    // 兼容旧检查：集下有项目则报错
    const projCount = db.prepare("SELECT COUNT(*) as c FROM projects WHERE project_set_id = ?").get(id).c;
    if (projCount > 0) throw new Error("项目集下还有项目，无法删除");
    const row = db.prepare("SELECT name FROM project_sets WHERE id = ?").get(id);
    db.prepare("DELETE FROM project_sets WHERE id = ?").run(id);
    if (row) logAudit(null, "删除项目集", "project_set", id, JSON.stringify({ name: row.name }), null);
    return true;
  }

  /**
   * 项目集拖拽排序持久化（v1.3.1）：按传入 ids 顺序重写 sort
   * @param {string[]} ids 排序后的项目集 id 列表
   */
  function reorderProjectSets(ids) {
    if (!Array.isArray(ids)) throw new Error("ids 必须为数组");
    const upd = db.prepare("UPDATE project_sets SET sort = ? WHERE id = ?");
    db.transaction(() => {
      ids.forEach((id, i) => upd.run(i, id));
    })();
    // V2.3.1 补审：项目集为全局实体无项目归属，projectId 归 NULL（与 deleteProjectSet 一致）
    logAudit(null, "排序项目集", "project_set", null, null, JSON.stringify({ ids }));
    return true;
  }

  function getProjectSetWithProjectCount(id) {
    const set = getProjectSet(id);
    if (!set) return null;
    const c = db.prepare("SELECT COUNT(*) as c FROM projects WHERE project_set_id = ?").get(id).c;
    return { ...set, projectCount: c };
  }

  function listProjectSetsWithCounts() {
    const sets = listProjectSets();
    return sets.map((s) => {
      const c = db.prepare("SELECT COUNT(*) as c FROM projects WHERE project_set_id = ?").get(s.id).c;
      return { ...s, projectCount: c };
    });
  }

  return {
    listProjectSets,
    getProjectSet,
    createProjectSet,
    updateProjectSet,
    deleteProjectSet,
    reorderProjectSets,
    getProjectSetWithProjectCount,
    listProjectSetsWithCounts,
  };
}
