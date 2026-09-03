// Requirements（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createRequirementsModule(ctx) {
  const { db, shortId } = ctx;
  const resolveRowById = (...a) => ctx.resolveRowById(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const saveVersion = (...a) => ctx.saveVersion(...a);
  const ensureBaselineVersion = (...a) => ctx.ensureBaselineVersion(...a);
  const deleteVersionsFor = (...a) => ctx.deleteVersionsFor(...a);
  const getComments = (...a) => ctx.getComments(...a);
  // ===== Requirements（V2.1.3 需求管理）=====
  // 三态：待处理 / 已完成 / 已取消（V2.1.4 放开为自由切换，不再冻结终态）
  const REQUIREMENT_STATUSES = ["待处理", "已完成", "已取消"];

  function requirementRowToObject(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || "",
      status: row.status,
      priority: row.priority || "P3",
      createdAt: row.created_at,
    };
  }

  function getRequirement(projectId, id) {
    const row = resolveRowById("requirements", "id", "project_id", projectId, id, "需求", (r) => r.name);
    if (!row) throw new Error(`需求 ${id} 不存在`);
    const resolvedId = row.id; // 短前缀场景下以解析后的完整 ID 查询关联数据
    const planIds = db.prepare("SELECT plan_id FROM requirement_plans WHERE requirement_id = ?")
      .all(resolvedId).map((r) => r.plan_id);
    const plans = db.prepare(`
      SELECT p.id, p.title, p.status, p.created_at AS createdAt
      FROM plans p JOIN requirement_plans rp ON rp.plan_id = p.id
      WHERE rp.requirement_id = ? ORDER BY p.created_at ASC
    `).all(resolvedId);
    return {
      ...requirementRowToObject(row),
      projectName: db.prepare("SELECT name FROM projects WHERE id = ?").get(row.project_id)?.name || null,
      planIds,
      plans,
      comments: getComments(row.project_id, "requirement", resolvedId),
    };
  }

  function replaceRequirementPlans(projectId, requirementId, planIds) {
    // 校验方案都存在且属于本项目
    for (const pid of planIds) {
      const exists = db.prepare("SELECT 1 FROM plans WHERE id = ? AND project_id = ?").get(pid, projectId);
      if (!exists) throw new Error(`方案 ${pid} 不存在`);
    }
    db.prepare("DELETE FROM requirement_plans WHERE requirement_id = ?").run(requirementId);
    const ins = db.prepare("INSERT INTO requirement_plans (requirement_id, plan_id) VALUES (?, ?)");
    for (const pid of planIds) ins.run(requirementId, pid);
  }

  function createRequirement(projectId, data = {}) {
    const name = String(data.name || "").trim();
    if (!name) throw new Error("需求名称不能为空");
    if (name.length > 50) throw new Error("需求名称最多50个字符");
    const req = {
      id: shortId(), project_id: projectId, name,
      description: String(data.description || ""),
      status: "待处理", priority: data.priority || "P3",
      created_at: new Date().toISOString(),
    };
    const planIds = Array.isArray(data.planIds) ? [...new Set(data.planIds)] : [];
    const run = db.transaction(() => {
      db.prepare("INSERT INTO requirements (id, project_id, name, description, status, priority, created_at) VALUES (?,?,?,?,?,?,?)")
        .run(req.id, req.project_id, req.name, req.description, req.status, req.priority, req.created_at);
      if (planIds.length) replaceRequirementPlans(projectId, req.id, planIds);
      logAudit(projectId, "创建需求", "requirement", req.id, null,
        JSON.stringify({ name, priority: req.priority, planIds }));
    });
    run();
    // 版本管理：创建即存 v1
    saveVersion(projectId, "requirement", req.id, {
      title: req.name, content: req.description, extra: { status: req.status, priority: req.priority },
    });
    return getRequirement(projectId, req.id);
  }

  function updateRequirement(projectId, id, data = {}) {
    const cur = db.prepare("SELECT * FROM requirements WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!cur) throw new Error(`需求 ${id} 不存在`);
    if (cur.status !== "待处理") throw new Error("已完成/已取消的需求不可修改");
    const newName = data.name !== undefined ? String(data.name).trim() : cur.name;
    if (!newName) throw new Error("需求名称不能为空");
    const newDesc = data.description !== undefined ? String(data.description) : cur.description;
    const newPriority = data.priority !== undefined ? data.priority : cur.priority;
    const run = db.transaction(() => {
      db.prepare("UPDATE requirements SET name = ?, description = ?, priority = ? WHERE id = ? AND project_id = ?")
        .run(newName, newDesc, newPriority, id, projectId);
      if (Array.isArray(data.planIds)) replaceRequirementPlans(projectId, id, [...new Set(data.planIds)]);
      const diff = {};
      if (newName !== cur.name) diff.name = { old: cur.name, new: newName };
      if (newDesc !== cur.description) diff.description = "[已变更]";
      if (newPriority !== cur.priority) diff.priority = { old: cur.priority, new: newPriority };
      logAudit(projectId, "更新需求", "requirement", id,
        Object.keys(diff).length ? JSON.stringify(diff) : null, null);
      // 版本管理：仅名称/描述变更才存版（优先级等字段变更不算新版本）
      if (diff.name !== undefined || diff.description !== undefined) {
        // 版本功能上线前的老对象：先补「修改前基线」，第一次修改即可对比
        ensureBaselineVersion(projectId, "requirement", id, cur, null);
        saveVersion(projectId, "requirement", id, {
          title: newName, content: newDesc, extra: { status: cur.status, priority: newPriority },
        });
      }
    });
    run();
    return getRequirement(projectId, id);
  }

  function updateRequirementStatus(projectId, id, status) {
    if (!REQUIREMENT_STATUSES.includes(status)) throw new Error(`无效需求状态：${status}`);
    const cur = db.prepare("SELECT * FROM requirements WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!cur) throw new Error(`需求 ${id} 不存在`);
    if (cur.status === status) return getRequirement(projectId, id);
    // 三态自由切换（待处理 ↔ 已完成/已取消），仅校验状态合法性
    db.prepare("UPDATE requirements SET status = ? WHERE id = ?").run(status, id);
    logAudit(projectId, "更新需求状态", "requirement", id,
      JSON.stringify({ old: cur.status, new: status }), null);
    return getRequirement(projectId, id);
  }

  /** 删除方案时解除验证卡 plan_ids 弱关联（JSON 数组过滤，不改验证卡本身） */
  function unlinkPlanFromVerifications(projectId, planId) {
    const rows = db.prepare("SELECT id, plan_ids FROM verifications WHERE project_id = ?").all(projectId);
    const upd = db.prepare("UPDATE verifications SET plan_ids = ? WHERE id = ?");
    for (const r of rows) {
      let ids = [];
      try { ids = JSON.parse(r.plan_ids || "[]"); } catch { ids = []; }
      if (!Array.isArray(ids) || !ids.includes(planId)) continue;
      upd.run(JSON.stringify(ids.filter((x) => x !== planId)), r.id);
    }
  }

  function deleteRequirement(projectId, id) {
    const row = db.prepare("SELECT name, status FROM requirements WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!row) throw new Error(`需求 ${id} 不存在`);
    // V2.1.4：已完成的需求保留交付记录，禁止删除（仅待处理/已取消可删）
    if (row.status === "已完成") throw new Error("已完成的需求不可删除");
    const run = db.transaction(() => {
      db.prepare("DELETE FROM requirement_plans WHERE requirement_id = ?").run(id);
      // V2.6：评论表无 SQL 外键（同列多引用），应用层级联清评论
      db.prepare("DELETE FROM comments WHERE target_type = 'requirement' AND target_id = ?").run(id);
      // 验证卡不关联需求（原句误用 comments 模型导致 no such column，V2.6.1 修复）
      deleteVersionsFor(projectId, "requirement", id);
      db.prepare("DELETE FROM requirements WHERE id = ?").run(id);
      logAudit(projectId, "删除需求", "requirement", id, JSON.stringify({ name: row.name }), null);
    });
    run();
    return true;
  }

  function listRequirements(projectId, opts = {}) {
    const { limit = 50, offset = 0, status, keyword, id, sort } = opts;
    const conds = ["project_id = ?"];
    const args = [projectId];
    if (id) { conds.push("id = ?"); args.push(id); }
    if (status && status !== "全部") { conds.push("status = ?"); args.push(status); }
    if (keyword) { conds.push("(name LIKE ? OR description LIKE ?)"); args.push(`%${keyword}%`, `%${keyword}%`); }
    const where = conds.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) c FROM requirements WHERE ${where}`).get(...args).c;
    // V2.2 R12 需求排序：default=创建时间倒序；priority=优先级 P0→P5 升序（非法/空归最低档 6），同级按创建时间倒序
    // 均以 id 兜底保证分页排序稳定（同 created_at 时翻页不重复/跳变）
    const orderBy = sort === "priority"
      ? "CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 WHEN 'P5' THEN 5 ELSE 6 END ASC, created_at DESC, id"
      : "created_at DESC, id";
    const rows = db.prepare(`SELECT * FROM requirements WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...args, limit, offset);
    const planCounts = db.prepare("SELECT requirement_id, COUNT(*) c FROM requirement_plans GROUP BY requirement_id")
      .all();
    const countMap = {};
    planCounts.forEach((r) => (countMap[r.requirement_id] = r.c));
    const planIdRows = db.prepare("SELECT requirement_id, plan_id FROM requirement_plans").all();
    const planIdsMap = {};
    planIdRows.forEach((r) => {
      (planIdsMap[r.requirement_id] ||= []).push(r.plan_id);
    });
    return {
      total,
      items: rows.map((r) => ({
        ...requirementRowToObject(r),
        planCount: countMap[r.id] || 0,
        planIds: planIdsMap[r.id] || [],
      })),
    };
  }

  function linkRequirementPlans(projectId, requirementId, planIds) {
    getRequirement(projectId, requirementId);
    const ids = [...new Set(planIds || [])];
    if (!ids.length) return { linked: 0 };
    const run = db.transaction(() => {
      for (const pid of ids) {
        const exists = db.prepare("SELECT 1 FROM plans WHERE id = ? AND project_id = ?").get(pid, projectId);
        if (!exists) throw new Error(`方案 ${pid} 不存在`);
        db.prepare("INSERT OR IGNORE INTO requirement_plans (requirement_id, plan_id) VALUES (?, ?)").run(requirementId, pid);
      }
      logAudit(projectId, "关联方案", "requirement", requirementId, null, JSON.stringify({ planIds: ids }));
    });
    run();
    return { linked: ids.length };
  }

  function unlinkRequirementPlans(projectId, requirementId, planIds) {
    getRequirement(projectId, requirementId);
    const ids = [...new Set(planIds || [])];
    if (!ids.length) return { unlinked: 0 };
    const run = db.transaction(() => {
      for (const pid of ids) {
        db.prepare("DELETE FROM requirement_plans WHERE requirement_id = ? AND plan_id = ?").run(requirementId, pid);
      }
      logAudit(projectId, "解除方案关联", "requirement", requirementId, null, JSON.stringify({ planIds: ids }));
    });
    run();
    return { unlinked: ids.length };
  }

  return {
    requirementRowToObject,
    getRequirement,
    replaceRequirementPlans,
    createRequirement,
    updateRequirement,
    updateRequirementStatus,
    unlinkPlanFromVerifications,
    deleteRequirement,
    listRequirements,
    linkRequirementPlans,
    unlinkRequirementPlans,
  };
}
