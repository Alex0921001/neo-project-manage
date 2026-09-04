// 验证模块（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createVerificationsModule(ctx) {
  const { db, shortId, escapeLike } = ctx;
  const resolveRowById = (...a) => ctx.resolveRowById(...a);
  const auditText = (...a) => ctx.auditText(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const markFtsDirty = (...a) => ctx.markFtsDirty(...a);
  // ===== 验证模块（V2.6.1 重构：验证卡（名称/关联任务/备注）+ 卡内验证项清单）=====

  function verificationRowToObject(r) {
    let taskIds = [];
    let planIds = [];
    try { taskIds = JSON.parse(r.task_ids || "[]"); } catch { taskIds = []; }
    try { planIds = JSON.parse(r.plan_ids || "[]"); } catch { planIds = []; }
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      note: r.note || "",
      taskIds,
      planIds,
      createdAt: r.created_at,
      updatedAt: r.updated_at || null,
    };
  }

  /** 卡片进度 + 关联任务/方案名（列表/详情共用） */
  function verificationWithMeta(r) {
    const v = verificationRowToObject(r);
    const agg = db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status), 0) AS done FROM verification_items WHERE verification_id = ?").get(r.id);
    v.progress = { total: agg.total || 0, done: agg.done || 0 };
    v.taskNames = v.taskIds
      .map((tid) => db.prepare("SELECT id, name, done FROM tasks WHERE id = ?").get(tid))
      .filter(Boolean)
      .map((t) => ({ id: t.id, name: t.name, done: !!t.done }));
    v.planNames = v.planIds
      .map((pid) => db.prepare("SELECT id, title, status FROM plans WHERE id = ?").get(pid))
      .filter(Boolean)
      .map((pl) => ({ id: pl.id, name: pl.title, status: pl.status }));
    return v;
  }

  function listVerifications(projectId, opts = {}) {
    const page = Number.isInteger(opts.page) && opts.page >= 1 ? opts.page : 1;
    const pageSize = Number.isInteger(opts.pageSize) && opts.pageSize >= 1 ? Math.min(opts.pageSize, 100) : 20;
    const conds = ["project_id = ?"];
    const args = [projectId];
    if (opts.keyword) {
      // keyword 支持按 id 精确匹配（完全等于 id 或 id 前缀，前端搜索框粘 id 可直接命中）
      const kw = escapeLike(opts.keyword);
      conds.push("(name LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR id = ? OR id LIKE ? ESCAPE '\\')");
      args.push(`%${kw}%`, `%${kw}%`, opts.keyword, `${kw}%`);
    }
    // 筛选：关联任务/方案（JSON 数组 LIKE 匹配）
    if (opts.taskId) { conds.push("task_ids LIKE ?"); args.push(`%"${opts.taskId}"%`); }
    if (opts.planId) { conds.push("plan_ids LIKE ?"); args.push(`%"${opts.planId}"%`); }
    const where = conds.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) c FROM verifications WHERE ${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM verifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize);
    return { total, page, pageSize, items: rows.map(verificationWithMeta) };
  }

  function getVerificationRowOrThrow(projectId, id) {
    const row = db.prepare("SELECT * FROM verifications WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!row) throw new Error(`验证 ${id} 不存在`);
    return row;
  }

  /** 全局按 ID/唯一短前缀查验证卡（无需 projectId）：V2.6.1 对齐 get_plan / get_task 查询体系 */
  function getVerificationGlobal(id) {
    const row = resolveRowById("verifications", "id", "project_id", null, id, "验证", (r) => r.name);
    if (!row) return null;
    const meta = verificationWithMeta(row);
    const proj = db.prepare("SELECT name FROM projects WHERE id = ?").get(row.project_id);
    return { ...meta, projectId: row.project_id, projectName: proj?.name || "" };
  }

  function normalizeVerificationTaskIds(projectId, taskIds) {
    const ids = Array.isArray(taskIds) ? [...new Set(taskIds)] : [];
    for (const tid of ids) {
      const exists = db.prepare("SELECT 1 FROM tasks WHERE id = ? AND project_id = ?").get(tid, projectId);
      if (!exists) throw new Error(`任务 ${tid} 不存在`);
    }
    return ids;
  }

  function normalizeVerificationPlanIds(projectId, planIds) {
    const ids = Array.isArray(planIds) ? [...new Set(planIds)] : [];
    for (const pid of ids) {
      const exists = db.prepare("SELECT 1 FROM plans WHERE id = ? AND project_id = ?").get(pid, projectId);
      if (!exists) throw new Error(`方案 ${pid} 不存在`);
    }
    return ids;
  }

  function createVerification(projectId, data = {}) {
    const name = String(data.name || "").trim();
    if (!name) throw new Error("验证名称不能为空");
    if (!db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) throw new Error(`项目 ${projectId} 不存在`);
    const taskIds = normalizeVerificationTaskIds(projectId, data.taskIds);
    const planIds = normalizeVerificationPlanIds(projectId, data.planIds);
    const now = new Date().toISOString();
    const id = shortId();
    db.prepare("INSERT INTO verifications (id, project_id, name, note, task_ids, plan_ids, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, projectId, name, String(data.note || "").trim(), JSON.stringify(taskIds), JSON.stringify(planIds), now, now);
    logAudit(projectId, "创建验证", "verification", id, null, JSON.stringify({ name }));
    markFtsDirty(projectId);
    return verificationWithMeta(db.prepare("SELECT * FROM verifications WHERE id = ?").get(id));
  }

  function updateVerification(projectId, id, data = {}) {
    const row = getVerificationRowOrThrow(projectId, id);
    const name = data.name !== undefined ? String(data.name).trim() : row.name;
    if (!name) throw new Error("验证名称不能为空");
    const note = data.note !== undefined ? String(data.note).trim() : row.note;
    const cur = verificationRowToObject(row);
    const taskIds = data.taskIds !== undefined ? normalizeVerificationTaskIds(projectId, data.taskIds) : cur.taskIds;
    const planIds = data.planIds !== undefined ? normalizeVerificationPlanIds(projectId, data.planIds) : cur.planIds;
    db.prepare("UPDATE verifications SET name = ?, note = ?, task_ids = ?, plan_ids = ?, updated_at = ? WHERE id = ?")
      .run(name, note, JSON.stringify(taskIds), JSON.stringify(planIds), new Date().toISOString(), id);
    logAudit(projectId, "编辑验证", "verification", id, JSON.stringify({ name: row.name }), JSON.stringify({ name }));
    markFtsDirty(projectId);
    return verificationWithMeta(db.prepare("SELECT * FROM verifications WHERE id = ?").get(id));
  }

  function deleteVerification(projectId, id) {
    const row = getVerificationRowOrThrow(projectId, id);
    db.prepare("DELETE FROM verifications WHERE id = ?").run(id); // items 由外键级联
    logAudit(projectId, "删除验证", "verification", id, JSON.stringify({ name: row.name }), null);
    markFtsDirty(projectId);
    return true;
  }

  function verificationItemRowToObject(r) {
    return {
      id: r.id,
      verificationId: r.verification_id,
      category: r.category || "",
      content: r.content,
      note: r.note || "",
      status: !!r.status,
      checkedAt: r.checked_at || null,
      checkedBy: r.checked_by || null,
      createdAt: r.created_at,
    };
  }

  function listVerificationItems(projectId, verificationId) {
    getVerificationRowOrThrow(projectId, verificationId);
    const rows = db.prepare("SELECT * FROM verification_items WHERE verification_id = ? ORDER BY created_at ASC, id").all(verificationId);
    return { total: rows.length, items: rows.map(verificationItemRowToObject) };
  }

  function createVerificationItem(projectId, verificationId, data = {}) {
    getVerificationRowOrThrow(projectId, verificationId);
    const content = String(data.content || "").trim();
    if (!content) throw new Error("验证项内容不能为空");
    const item = {
      id: shortId(), verificationId,
      category: String(data.category || "").trim(), content,
      note: String(data.note || "").trim(),
      createdAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO verification_items (id, verification_id, category, content, note, created_at) VALUES (?,?,?,?,?,?)")
      .run(item.id, verificationId, item.category, item.content, item.note, item.createdAt);
    logAudit(projectId, "创建验证项", "verification_item", item.id, null,
      JSON.stringify({ verificationId, category: item.category, content: auditText(content) }));
    return verificationItemRowToObject(db.prepare("SELECT * FROM verification_items WHERE id = ?").get(item.id));
  }

  function updateVerificationItem(projectId, id, data = {}) {
    const row = db.prepare("SELECT * FROM verification_items WHERE id = ?").get(id);
    if (!row) throw new Error(`验证项 ${id} 不存在`);
    getVerificationRowOrThrow(projectId, row.verification_id);
    const content = data.content !== undefined ? String(data.content).trim() : row.content;
    if (!content) throw new Error("验证项内容不能为空");
    const note = data.note !== undefined ? String(data.note).trim() : row.note;
    const category = data.category !== undefined ? String(data.category).trim() : row.category;
    db.prepare("UPDATE verification_items SET content = ?, note = ?, category = ? WHERE id = ?").run(content, note, category, id);
    logAudit(projectId, "编辑验证项", "verification_item", id,
      JSON.stringify({ content: auditText(row.content) }), JSON.stringify({ content: auditText(content) }));
    return verificationItemRowToObject(db.prepare("SELECT * FROM verification_items WHERE id = ?").get(id));
  }

  function toggleVerificationItem(projectId, id) {
    const row = db.prepare("SELECT * FROM verification_items WHERE id = ?").get(id);
    if (!row) throw new Error(`验证项 ${id} 不存在`);
    getVerificationRowOrThrow(projectId, row.verification_id);
    const now = new Date().toISOString();
    const next = row.status ? 0 : 1;
    db.prepare("UPDATE verification_items SET status = ?, checked_at = ?, checked_by = ? WHERE id = ?")
      .run(next, next ? now : null, next ? "owner" : null, id);
    logAudit(projectId, next ? "验证通过" : "验证退回", "verification_item", id,
      JSON.stringify({ status: row.status }), JSON.stringify({ status: next }));
    return verificationItemRowToObject(db.prepare("SELECT * FROM verification_items WHERE id = ?").get(id));
  }

  function deleteVerificationItem(projectId, id) {
    const row = db.prepare("SELECT * FROM verification_items WHERE id = ?").get(id);
    if (!row) throw new Error(`验证项 ${id} 不存在`);
    getVerificationRowOrThrow(projectId, row.verification_id);
    db.prepare("DELETE FROM verification_items WHERE id = ?").run(id);
    logAudit(projectId, "删除验证项", "verification_item", id,
      JSON.stringify({ content: auditText(row.content) }), null);
    return true;
  }

  // ===== 批量操作（V2.6.2，范式对齐 tasks 模块）=====

  /**
   * 批量创建验证卡（事务包裹：任一条失败整体回滚，对齐 createTasks 范式）
   * @param {Array<{name: string, taskIds?, planIds?, note?}>} items 最多 50 条
   * @returns {Array} 创建后的验证卡对象列表
   */
  function createVerifications(projectId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多创建 50 个验证卡");
    for (const [i, it] of items.entries()) {
      if (!it || !String(it.name || "").trim()) throw new Error(`第 ${i + 1} 个验证卡缺少名称`);
    }
    return db.transaction(() =>
      items.map((it, i) => {
        try {
          return createVerification(projectId, it);
        } catch (e) {
          throw new Error(`第 ${i + 1} 个验证卡：${e.message}`);
        }
      })
    )();
  }

  /**
   * 单卡内批量创建验证项（事务包裹：任一条失败整体回滚；建卡后一次导入检查清单的高频场景）
   * @param {Array<{content: string, category?, note?}>} items 最多 50 条
   * @returns {Array} 创建后的验证项对象列表
   */
  function createVerificationItems(projectId, verificationId, items) {
    getVerificationRowOrThrow(projectId, verificationId);
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多创建 50 个验证项");
    for (const [i, it] of items.entries()) {
      if (!it || !String(it.content || "").trim()) throw new Error(`第 ${i + 1} 个验证项缺少内容`);
    }
    return db.transaction(() =>
      items.map((it, i) => {
        try {
          return createVerificationItem(projectId, verificationId, it);
        } catch (e) {
          throw new Error(`第 ${i + 1} 个验证项：${e.message}`);
        }
      })
    )();
  }

  /**
   * 批量编辑验证项（逐条独立语义，对齐 updateTasks 范式）
   * @param {Array<{id: string, content?, category?, note?}>} items 最多 50 条
   * @returns {{success: Array<{id:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function updateVerificationItems(projectId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多编辑 50 个验证项");
    const success = [];
    const failed = [];
    items.forEach((it, i) => {
      const index = i + 1;
      if (!it || !it.id) {
        failed.push({ id: it?.id || null, index, error: "缺少验证项 ID" });
        return;
      }
      try {
        updateVerificationItem(projectId, it.id, it);
        success.push({ id: it.id });
      } catch (e) {
        failed.push({ id: it.id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  /**
   * 批量勾选/退回验证项（items[].done 为目标态，幂等：已是目标态则跳过不改勾选时间）
   * 逐条独立：写勾选时间/操作人 + 逐条审计「验证通过/验证退回」（仅实际变化时）
   * @param {Array<{id: string, done: boolean}>} items 最多 50 条
   * @returns {{success: Array<{id:string,status:boolean}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function toggleVerificationItems(projectId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多操作 50 个验证项");
    const success = [];
    const failed = [];
    items.forEach((it, i) => {
      const index = i + 1;
      if (!it || !it.id) {
        failed.push({ id: it?.id || null, index, error: "缺少验证项 ID" });
        return;
      }
      if (typeof it.done !== "boolean") {
        failed.push({ id: it.id, index, error: "done 必须为布尔值（目标状态）" });
        return;
      }
      try {
        const row = db.prepare("SELECT * FROM verification_items WHERE id = ?").get(it.id);
        if (!row) throw new Error(`验证项 ${it.id} 不存在`);
        getVerificationRowOrThrow(projectId, row.verification_id);
        if (!!row.status === it.done) {
          // 幂等：已是目标态，不重复写勾选时间与审计
          success.push({ id: it.id, status: it.done });
          return;
        }
        const now = new Date().toISOString();
        db.prepare("UPDATE verification_items SET status = ?, checked_at = ?, checked_by = ? WHERE id = ?")
          .run(it.done ? 1 : 0, it.done ? now : null, it.done ? "owner" : null, it.id);
        logAudit(projectId, it.done ? "验证通过" : "验证退回", "verification_item", it.id,
          JSON.stringify({ status: row.status }), JSON.stringify({ status: it.done ? 1 : 0 }));
        success.push({ id: it.id, status: it.done });
      } catch (e) {
        failed.push({ id: it.id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  /**
   * 批量删除验证项（逐条独立语义；含内容快照审计）
   * @param {string[]} ids 最多 50 个
   * @returns {{success: Array<{id:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function deleteVerificationItems(projectId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids 不能为空");
    if (ids.length > 50) throw new Error("单次最多删除 50 个验证项");
    const success = [];
    const failed = [];
    ids.forEach((id, i) => {
      const index = i + 1;
      if (!id) {
        failed.push({ id: null, index, error: "缺少验证项 ID" });
        return;
      }
      try {
        deleteVerificationItem(projectId, id);
        success.push({ id });
      } catch (e) {
        failed.push({ id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  /**
   * 批量删除验证卡（逐条独立语义；卡内验证项由外键级联删除）
   * @param {string[]} verificationIds 最多 50 个
   * @returns {{success: Array<{id:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function deleteVerifications(projectId, verificationIds) {
    if (!Array.isArray(verificationIds) || verificationIds.length === 0) throw new Error("verificationIds 不能为空");
    if (verificationIds.length > 50) throw new Error("单次最多删除 50 个验证卡");
    const success = [];
    const failed = [];
    verificationIds.forEach((id, i) => {
      const index = i + 1;
      if (!id) {
        failed.push({ id: null, index, error: "缺少验证卡 ID" });
        return;
      }
      try {
        deleteVerification(projectId, id);
        success.push({ id });
      } catch (e) {
        failed.push({ id, index, error: e.message });
      }
    });
    return { success, failed };
  }


  // ===== 验证分类字典（分组管理）=====

  const DEFAULT_VERIFICATION_CATEGORIES = ["功能验证", "边界与异常", "回归验证"];
  /** 新项目预置默认分类（createProject 内调用） */
  function seedVerificationCategories(projectId) {
    const ins = db.prepare(
      "INSERT OR IGNORE INTO verification_categories (id, project_id, name, created_at) VALUES (?,?,?,?)"
    );
    const now = new Date().toISOString();
    for (const name of DEFAULT_VERIFICATION_CATEGORIES) ins.run(shortId(), projectId, name, now);
  }

  function listVerificationCategories(projectId) {
    const rows = db.prepare(
      "SELECT * FROM verification_categories WHERE project_id = ? ORDER BY created_at ASC, id"
    ).all(projectId);
    return { total: rows.length, items: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })) };
  }

  function createVerificationCategory(projectId, name) {
    const n = String(name || "").trim();
    if (!n) throw new Error("分类名称不能为空");
    if (n.length > 20) throw new Error("分类名称最长 20 字");
    const dup = db.prepare("SELECT 1 FROM verification_categories WHERE project_id = ? AND name = ?").get(projectId, n);
    if (dup) throw new Error(`分类「${n}」已存在`);
    const id = shortId();
    db.prepare("INSERT INTO verification_categories (id, project_id, name, created_at) VALUES (?,?,?,?)")
      .run(id, projectId, n, new Date().toISOString());
    logAudit(projectId, "新建验证分类", "verification_category", id, null, JSON.stringify({ name: n }));
    return { id, name: n };
  }

  /** 重命名字典项并同步该分类下所有验证项 */
  function renameVerificationCategory(projectId, id, name) {
    const row = db.prepare("SELECT * FROM verification_categories WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!row) throw new Error(`分类 ${id} 不存在`);
    const n = String(name || "").trim();
    if (!n) throw new Error("分类名称不能为空");
    if (n.length > 20) throw new Error("分类名称最长 20 字");
    if (n !== row.name) {
      const dup = db.prepare("SELECT 1 FROM verification_categories WHERE project_id = ? AND name = ?").get(projectId, n);
      if (dup) throw new Error(`分类「${n}」已存在`);
      db.prepare("UPDATE verification_categories SET name = ? WHERE id = ?").run(n, id);
      db.prepare("UPDATE verification_items SET category = ? WHERE verification_id IN (SELECT id FROM verifications WHERE project_id = ?) AND category = ?")
        .run(n, projectId, row.name);
      logAudit(projectId, "重命名验证分类", "verification_category", id,
        JSON.stringify({ name: row.name }), JSON.stringify({ name: n }));
    }
    return { id, name: n };
  }

  /** 删字典项：该分类下所有验证项归入「通用」（category 置空） */
  function deleteVerificationCategory(projectId, id) {
    const row = db.prepare("SELECT * FROM verification_categories WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!row) throw new Error(`分类 ${id} 不存在`);
    db.prepare("UPDATE verification_items SET category = '' WHERE verification_id IN (SELECT id FROM verifications WHERE project_id = ?) AND category = ?")
      .run(projectId, row.name);
    db.prepare("DELETE FROM verification_categories WHERE id = ?").run(id);
    logAudit(projectId, "删除验证分类", "verification_category", id, JSON.stringify({ name: row.name }), null);
    return true;
  }

  /** 批量清空某验证卡内某分类的验证项 */
  function clearVerificationItems(projectId, verificationId, category) {
    getVerificationRowOrThrow(projectId, verificationId);
    const cat = String(category || "").trim();
    const rows = db.prepare(
      "SELECT id, content FROM verification_items WHERE verification_id = ? AND COALESCE(category, '') = ?"
    ).all(verificationId, cat);
    if (rows.length === 0) throw new Error("该分组下没有验证项");
    const run = db.transaction(() => {
      db.prepare("DELETE FROM verification_items WHERE verification_id = ? AND COALESCE(category, '') = ?")
        .run(verificationId, cat);
      logAudit(projectId, "清空验证分组", "verification", verificationId,
        null, JSON.stringify({ category: cat, count: rows.length }));
    });
    run();
    return { deleted: rows.length };
  }

  return {
    verificationRowToObject,
    verificationWithMeta,
    listVerifications,
    getVerificationRowOrThrow,
    getVerificationGlobal,
    normalizeVerificationTaskIds,
    normalizeVerificationPlanIds,
    createVerification,
    updateVerification,
    deleteVerification,
    verificationItemRowToObject,
    listVerificationItems,
    createVerificationItem,
    updateVerificationItem,
    toggleVerificationItem,
    deleteVerificationItem,
    // 批量（V2.6.2）
    createVerifications,
    createVerificationItems,
    updateVerificationItems,
    toggleVerificationItems,
    deleteVerificationItems,
    deleteVerifications,
    seedVerificationCategories,
    listVerificationCategories,
    createVerificationCategory,
    renameVerificationCategory,
    deleteVerificationCategory,
    clearVerificationItems,
  };
}
