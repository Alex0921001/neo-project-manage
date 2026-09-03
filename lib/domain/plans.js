// 方案管理（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createPlansModule(ctx) {
  const { db, shortId, escapeLike } = ctx;
  const resolveRowById = (...a) => ctx.resolveRowById(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const saveVersion = (...a) => ctx.saveVersion(...a);
  const ensureBaselineVersion = (...a) => ctx.ensureBaselineVersion(...a);
  const deleteVersionsFor = (...a) => ctx.deleteVersionsFor(...a);
  const getComments = (...a) => ctx.getComments(...a);
  const addComment = (...a) => ctx.addComment(...a);
  const deleteComment = (...a) => ctx.deleteComment(...a);
  const unlinkPlanFromVerifications = (...a) => ctx.unlinkPlanFromVerifications(...a);
  // ===== 方案管理（V2.1，plans + plan_comments）=====
  const PLAN_STATUS = ["草稿", "进行中", "已采纳", "已废弃"];

  function planRowToObject(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      content: row.content,
      status: row.status,
      taskId: row.task_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function getPlanRowOrThrow(projectId, planId) {
    const row = db.prepare("SELECT * FROM plans WHERE id = ? AND project_id = ?").get(planId, projectId);
    if (!row) throw new Error(`方案 ${planId} 不存在`);
    return row;
  }


  // ===== 方案↔需求反向挂载（V2.1.4 方案侧关联需求，多对多） =====
  function replacePlanRequirements(projectId, planId, requirementIds) {
    for (const rid of requirementIds) {
      const exists = db.prepare("SELECT 1 FROM requirements WHERE id = ? AND project_id = ?").get(rid, projectId);
      if (!exists) throw new Error(`需求 ${rid} 不存在`);
    }
    db.prepare("DELETE FROM requirement_plans WHERE plan_id = ?").run(planId);
    const ins = db.prepare("INSERT INTO requirement_plans (requirement_id, plan_id) VALUES (?, ?)");
    for (const rid of requirementIds) ins.run(rid, planId);
  }


  // ===== 方案↔任务反向挂载（V2.2 R14 方案侧关联任务，多对多） =====
  function replacePlanTasks(projectId, planId, taskIds) {
    for (const tid of taskIds) {
      const exists = db.prepare("SELECT 1 FROM tasks WHERE id = ? AND project_id = ?").get(tid, projectId);
      if (!exists) throw new Error(`任务 ${tid} 不存在`);
    }
    db.prepare("DELETE FROM task_plans WHERE plan_id = ?").run(planId);
    const ins = db.prepare("INSERT INTO task_plans (task_id, plan_id) VALUES (?, ?)");
    for (const tid of taskIds) ins.run(tid, planId);
  }

  function createPlan(projectId, title, content = "", requirementIds = [], taskIds = []) {
    const t = String(title || "").trim();
    if (!t) throw new Error("方案标题不能为空");
    if (t.length > 100) throw new Error("方案标题最长 100 字");
    const proj = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    const now = new Date().toISOString();
    const plan = {
      id: shortId(), project_id: projectId, title: t,
      content: String(content || ""), status: "草稿", task_id: null,
      created_at: now, updated_at: now,
    };
    const ids = Array.isArray(requirementIds) ? [...new Set(requirementIds)] : [];
    const taskIdsArr = Array.isArray(taskIds) ? [...new Set(taskIds)] : [];
    // V2.2 R14 关联校验前置：任何 ID 非法则在 INSERT 前抛错，避免产生幽灵方案
    for (const rid of ids) {
      const exists = db.prepare("SELECT 1 FROM requirements WHERE id = ? AND project_id = ?").get(rid, projectId);
      if (!exists) throw new Error(`需求 ${rid} 不存在`);
    }
    for (const tid of taskIdsArr) {
      const exists = db.prepare("SELECT 1 FROM tasks WHERE id = ? AND project_id = ?").get(tid, projectId);
      if (!exists) throw new Error(`任务 ${tid} 不存在`);
    }
    // 整体事务：INSERT + 写关联任一失败整体回滚（replace 内部校验为事务内兑底）
    db.transaction(() => {
      db.prepare(
        "INSERT INTO plans (id, project_id, title, content, status, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(plan.id, plan.project_id, plan.title, plan.content, plan.status, plan.task_id, plan.created_at, plan.updated_at);
      if (ids.length) replacePlanRequirements(projectId, plan.id, ids);
      if (taskIdsArr.length) replacePlanTasks(projectId, plan.id, taskIdsArr);
    })();
    logAudit(projectId, "创建方案", "plan", plan.id, null, JSON.stringify({ title: plan.title, status: plan.status }));
    // 版本管理：创建即存 v1
    saveVersion(projectId, "plan", plan.id, { title: plan.title, content: plan.content, extra: { status: plan.status } });
    return getPlan(projectId, plan.id);
  }

  function updatePlan(projectId, planId, data) {
    const cur = getPlanRowOrThrow(projectId, planId);
    // 业务校验（MCP 工具 + REST 同一实现，前端隐藏入口 + 后端兜底）：
    // - 标题 / 内容：仅「草稿 / 进行中」可改
    // - 状态：已转任务且任务存在时冻结（任务删除后可回退流转）
    const taskLinked = cur.task_id ? !!db.prepare("SELECT id FROM tasks WHERE id = ?").get(cur.task_id) : false;
    if ((data.title !== undefined || data.content !== undefined) && cur.status !== "草稿" && cur.status !== "进行中") {
      throw new Error("仅「草稿 / 进行中」状态的方案可编辑标题和内容");
    }
    if (data.status !== undefined && data.status !== cur.status && taskLinked) {
      throw new Error("该方案已转为任务且任务存在，状态已冻结，不能修改");
    }
    // V2.1.4 方案侧关联需求：全量替换，不参与 diff（仅改关联时 keys 为空也要生效）
    if (Array.isArray(data.requirementIds)) {
      replacePlanRequirements(projectId, planId, [...new Set(data.requirementIds)]);
    }
    // V2.2 R14 方案侧关联任务：全量替换，不参与 diff（与关联需求同模式）
    if (Array.isArray(data.taskIds)) {
      replacePlanTasks(projectId, planId, [...new Set(data.taskIds)]);
    }
    const diff = {};
    if (data.title !== undefined) {
      const t = String(data.title).trim();
      if (!t) throw new Error("方案标题不能为空");
      if (t.length > 100) throw new Error("方案标题最长 100 字");
      if (t !== cur.title) diff.title = t;
    }
    if (data.content !== undefined && String(data.content) !== cur.content) diff.content = String(data.content);
    if (data.status !== undefined) {
      if (!PLAN_STATUS.includes(data.status)) throw new Error(`非法方案状态：${data.status}`);
      if (data.status !== cur.status) diff.status = data.status;
    }
    const keys = Object.keys(diff);
    if (keys.length === 0) return getPlan(projectId, planId);
    const sets = { ...diff, updated_at: new Date().toISOString() };
    const setSql = Object.keys(sets).map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE plans SET ${setSql} WHERE id = ? AND project_id = ?`).run(...Object.values(sets), planId, projectId);
    const oldFrag = {}; const newFrag = {};
    for (const k of keys) { oldFrag[k] = cur[k]; newFrag[k] = diff[k]; }
    logAudit(projectId, "更新方案", "plan", planId, JSON.stringify(oldFrag), JSON.stringify(newFrag));
    // 版本管理：仅标题/内容变更才存版（状态等字段变更不算新版本）
    if (diff.title !== undefined || diff.content !== undefined) {
      // 版本功能上线前的老对象：先补「修改前基线」，第一次修改即可对比
      ensureBaselineVersion(projectId, "plan", planId, cur, null);
      saveVersion(projectId, "plan", planId, {
        title: diff.title ?? cur.title,
        content: diff.content ?? cur.content,
        extra: { status: diff.status ?? cur.status },
      });
    }
    return getPlan(projectId, planId);
  }

  function deletePlan(projectId, planId) {
    const row = getPlanRowOrThrow(projectId, planId);
    // 仅「草稿 / 已废弃」可删（已采纳含已转任务受保护；任务删除后可先回退状态再删）
    if (row.status !== "草稿" && row.status !== "已废弃") {
      throw new Error("仅「草稿 / 已废弃」状态的方案可删除；如需删除已采纳方案，请先将其状态改为「草稿」或「已废弃」");
    }
    // V2.2 R11/R14：requirement_plans / task_plans 无强依赖须应用层清理（防残留）；plan_comments 由外键级联删除
    // V2.6：统一评论表无 SQL 外键（同列多引用），应用层级联清评论
    db.transaction(() => {
      db.prepare("DELETE FROM requirement_plans WHERE plan_id = ?").run(planId);
      db.prepare("DELETE FROM task_plans WHERE plan_id = ?").run(planId);
      db.prepare("DELETE FROM comments WHERE target_type = 'plan' AND target_id = ?").run(planId);
      // 验证卡以任务为主、方案为弱关联（plan_ids JSON）：仅解除关联，不删卡（V2.6.1 修 no such column）
      unlinkPlanFromVerifications(projectId, planId);
      deleteVersionsFor(projectId, "plan", planId);
      db.prepare("DELETE FROM plans WHERE id = ? AND project_id = ?").run(planId, projectId);
      db.prepare("DELETE FROM plans WHERE id = ? AND project_id = ?").run(planId, projectId);
    })();
    logAudit(projectId, "删除方案", "plan", planId, JSON.stringify({ title: row.title }), null);
    return true;
  }

  function listPlans(projectId, opts = {}) {
    const { limit, offset, keyword, status, id } = opts;
    // 条件：项目归属 + 标题模糊搜索 + 状态精确筛选（V2.1 方案分页/筛选）+ 精确 id（V2.1.4）
    const where = ["p.project_id = ?"];
    const params = [projectId];
    if (id) {
      where.push("p.id = ?");
      params.push(id);
    }
    if (keyword) {
      where.push("p.title LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(keyword)}%`);
    }
    if (status && status !== "全部") {
      if (status === "已转任务") {
        // 已转任务：task_id 非空（转出过任务）
        where.push("p.task_id IS NOT NULL");
      } else {
        where.push("p.status = ?");
        params.push(status);
      }
    }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM plans p WHERE ${where.join(" AND ")}`).get(...params).c;
    let sql = `
      SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'plan' AND c.target_id = p.id) AS comment_count,
             t.name AS task_name
      FROM plans p LEFT JOIN tasks t ON t.id = p.task_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC, p.id
    `;
    if (limit) sql += " LIMIT ? OFFSET ?";
    const rows = limit
      ? db.prepare(sql).all(...params, limit, offset || 0)
      : db.prepare(sql).all(...params);
    return {
      total,
      items: rows.map((r) => ({ ...planRowToObject(r), commentCount: r.comment_count, taskName: r.task_name || null })),
    };
  }

  function getPlan(projectId, planId) {
    const row = resolveRowById("plans", "id", "project_id", projectId, planId, "方案", (r) => r.title);
    if (!row) throw new Error(`方案 ${planId} 不存在`);
    const resolvedId = row.id; // 短前缀场景下以解析后的完整 ID 查询关联数据
    // V2.6.1 修复：评论一律用解析后的归属项目查（全局短前缀查询时入参 projectId 为 null 会查空）
    const comments = getComments(row.project_id, "plan", resolvedId);
    const task = row.task_id ? db.prepare("SELECT id, name FROM tasks WHERE id = ?").get(row.task_id) : null;
    // V2.1.3 需求管理：方案反向展示满足的需求（多对多）
    const requirements = db.prepare(`
      SELECT r.id, r.name, r.status, r.priority, r.created_at AS createdAt
      FROM requirement_plans rp JOIN requirements r ON r.id = rp.requirement_id
      WHERE rp.plan_id = ? ORDER BY r.created_at ASC
    `).all(resolvedId);
    // V2.2 R14：方案反向展示关联任务（含任务名）
    const taskRefs = db.prepare(`
      SELECT t.id, t.name, t.done, t.priority
      FROM task_plans tp JOIN tasks t ON t.id = tp.task_id
      WHERE tp.plan_id = ? ORDER BY t.created_at ASC
    `).all(resolvedId).map((t) => ({ id: t.id, name: t.name, done: !!t.done, priority: t.priority }));
    return {
      ...planRowToObject(row),
      comments,
      projectName: db.prepare("SELECT name FROM projects WHERE id = ?").get(row.project_id)?.name || null,
      taskName: task?.name || null,
      taskExists: row.task_id ? !!task : null,
      requirements,
      taskRefs,
    };
  }

  function addPlanComment(projectId, planId, content) {
    // 旧接口转写统一评论表（Agent 工具 add_plan_comment 兼容入口）
    return addComment(projectId, "plan", planId, content);
  }

  function deletePlanComment(projectId, planId, commentId) {
    // 旧接口转写统一评论表（Agent 工具 delete_plan_comment 兼容入口）；planId 仅用于归属校验
    getPlanRowOrThrow(projectId, planId);
    return deleteComment(projectId, commentId);
  }

  return {
    planRowToObject,
    getPlanRowOrThrow,
    replacePlanRequirements,
    replacePlanTasks,
    createPlan,
    updatePlan,
    deletePlan,
    listPlans,
    getPlan,
    addPlanComment,
    deletePlanComment,
  };
}
