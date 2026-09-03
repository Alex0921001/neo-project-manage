// Annotations（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createAnnotationsModule(ctx) {
  const { db, shortId, escapeLike, sanitizeHtml } = ctx;
  const auditText = (...a) => ctx.auditText(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const getTaskOrThrow = (...a) => ctx.getTaskOrThrow(...a);
  // ===== Annotations =====

  // 批注类型（V2.0）：note=备注（默认）/ decision=决策 / risk=风险 / milestone=节点
  const ANNOTATION_KINDS = new Set(["note", "decision", "risk", "milestone"]);

  /**
   * 归一化批注 kind：空值兜底 note，非法值抛错（与 confirmed 的宽容透传不同，kind 值域固定，脏数据应尽早暴露）
   * @param {string|undefined} kind
   * @returns {string}
   */
  function normalizeAnnotationKind(kind) {
    if (kind === undefined || kind === null || kind === "") return "note";
    if (ANNOTATION_KINDS.has(kind)) return kind;
    throw new Error(`批注类型 kind 仅支持 note/decision/risk/milestone，收到「${kind}」`);
  }

  /**
   * 列出任务下批注（可按 kind 筛选）
   * @param {string} taskId
   * @param {string|undefined} kind note/decision/risk/milestone（不传=全部）
   */
  function getTaskAnnotations(taskId, kind) {
    const params = [taskId];
    let kindWhere = "";
    if (kind !== undefined && kind !== null && kind !== "") {
      // COALESCE 兜底：老数据 kind=NULL 视为 note，与读取层兜底语义一致（筛选 note 不漏老数据）
      kindWhere = "AND COALESCE(kind, 'note') = ?";
      params.push(normalizeAnnotationKind(kind));
    }
    return db.prepare(
      `SELECT id, content, confirmed, confirmed_at, created_at, kind FROM annotations WHERE task_id = ? ${kindWhere} ORDER BY created_at ASC`
    ).all(...params).map((r) => ({
      id: r.id,
      content: r.content,
      kind: r.kind || "note",
      confirmed: !!r.confirmed,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * 列出项目下全部批注（可按 kind / 关键词筛选，带所属任务名）
   * @param {string} projectId
   * @param {object} [opts] { kind?: string, keyword?: string }
   */
  function getProjectAnnotations(projectId, opts = {}) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const kind = opts.kind;
    const keyword = String(opts.keyword || "").trim();
    const params = [projectId];
    let where = "a.task_id IN (SELECT id FROM tasks WHERE project_id = ?)";
    if (kind !== undefined && kind !== null && kind !== "") {
      where += " AND COALESCE(a.kind, 'note') = ?";
      params.push(normalizeAnnotationKind(kind));
    }
    if (keyword) {
      where += " AND a.content LIKE ? ESCAPE '\\'";
      params.push(`%${escapeLike(keyword)}%`);
    }
    return db.prepare(`
      SELECT a.id, a.task_id, a.content, a.kind, a.confirmed, a.confirmed_at, a.created_at, t.name AS task_name
      FROM annotations a
      JOIN tasks t ON t.id = a.task_id
      WHERE ${where}
      ORDER BY a.created_at ASC
    `).all(...params).map((r) => ({
      id: r.id,
      taskId: r.task_id,
      taskName: r.task_name,
      content: r.content,
      kind: r.kind || "note",
      confirmed: !!r.confirmed,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
    }));
  }

  function createAnnotation(projectId, taskId, data) {
    // 校验任务存在且属于该项目（与 createAnnotations / deleteAnnotation 对齐，避免跨项目写入）
    getTaskOrThrow(projectId, taskId);
    // V2.1 规则：任务已完成不允许挂载便利贴
    const t = db.prepare("SELECT done FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId);
    if (t && t.done) throw new Error(`任务已完成，不能挂载便利贴`);
    if (noteContentEmpty(data.content)) throw new Error("批注内容不能为空");
    const ann = {
      id: shortId(),
      task_id: taskId,
      content: sanitizeHtml(data.content),
      kind: normalizeAnnotationKind(data.kind),
      confirmed: 0,
      confirmed_at: null,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO annotations (id, task_id, content, kind, confirmed, confirmed_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?)"
    ).run(ann.id, ann.task_id, ann.content, ann.kind, ann.created_at);
    logAudit(projectId, "创建批注", "annotation", ann.id, null, JSON.stringify({
      content: auditText(ann.content),
      kind: ann.kind,
      confirmed: false,
    }));
    return {
      id: ann.id, content: ann.content, kind: ann.kind, confirmed: false, confirmedAt: null, createdAt: ann.created_at,
    };
  }

  function updateAnnotation(taskId, annId, data) {
    const cur = db.prepare("SELECT id, content, kind, confirmed FROM annotations WHERE id = ? AND task_id = ?").get(annId, taskId);
    if (!cur) throw new Error(`批注 ${annId} 不存在`);
    // V2.1 规则：任务已完成，便利贴冻结（内容/类型/确认状态均不可改，删除不受限）
    const t = db.prepare("SELECT done FROM tasks WHERE id = ?").get(taskId);
    if (t && t.done) throw new Error("任务已完成，便利贴已冻结，不能修改");
    if (data.content !== undefined) {
      if (noteContentEmpty(data.content)) throw new Error("批注内容不能为空");
      db.prepare("UPDATE annotations SET content = ? WHERE id = ?").run(sanitizeHtml(data.content), annId);
    }
    if (data.kind !== undefined) {
      db.prepare("UPDATE annotations SET kind = ? WHERE id = ?").run(normalizeAnnotationKind(data.kind), annId);
    }
    if (data.confirmed !== undefined) {
      const confirmed = data.confirmed ? 1 : 0;
      const confirmedAt = data.confirmed ? new Date().toISOString() : null;
      db.prepare("UPDATE annotations SET confirmed = ?, confirmed_at = ? WHERE id = ?").run(confirmed, confirmedAt, annId);
    }
    const after = db.prepare("SELECT id, content, confirmed, confirmed_at, created_at, kind FROM annotations WHERE id = ?").get(annId);
    // 审计：批注签名无 projectId，从所属任务反查项目归属（V2.1 审计追踪）
    const projRow = db.prepare("SELECT project_id FROM tasks WHERE id = ?").get(taskId);
    const projectId = projRow?.project_id || null;
    const diff = {};
    const afterKind = after.kind || "note";
    const curKind = cur.kind || "note";
    if (auditText(cur.content) !== auditText(after.content)) {
      diff.content = { old: auditText(cur.content), new: auditText(after.content) };
    }
    if (curKind !== afterKind) diff.kind = { old: curKind, new: afterKind };
    if (!!cur.confirmed !== !!after.confirmed) {
      diff.confirmed = { old: !!cur.confirmed, new: !!after.confirmed };
    }
    if (projectId && Object.keys(diff).length > 0) {
      const oldFrag = {};
      const newFrag = {};
      for (const [k, v] of Object.entries(diff)) {
        oldFrag[k] = v.old;
        newFrag[k] = v.new;
      }
      logAudit(projectId, "更新批注", "annotation", annId, JSON.stringify(oldFrag), JSON.stringify(newFrag));
    }
    return {
      id: after.id, content: after.content,
      kind: afterKind,
      confirmed: !!after.confirmed, confirmedAt: after.confirmed_at,
      createdAt: after.created_at,
    };
  }

  function deleteAnnotation(projectId, taskId, annId) {
    // 校验任务属于项目
    getTaskOrThrow(projectId, taskId);
    // 校验批注属于任务
    const ann = db.prepare("SELECT id, content, kind FROM annotations WHERE id = ? AND task_id = ?").get(annId, taskId);
    if (!ann) throw new Error(`批注 ${annId} 不存在`);
    // 真正删除并校验
    const result = db.prepare("DELETE FROM annotations WHERE id = ? AND task_id = ?").run(annId, taskId);
    if (result.changes === 0) throw new Error(`批注 ${annId} 不存在`);
    logAudit(projectId, "删除批注", "annotation", annId, JSON.stringify({
      content: auditText(ann.content),
      kind: ann.kind || "note",
    }), null);
    return true;
  }

  /**
   * 批量创建批注（事务包裹，任一条校验失败则整体回滚）
   * @param {string} projectId
   * @param {string} taskId
   * @param {Array<{content: string}>} items 最多 50 个
   * @returns {Array} 创建后的批注列表
   */
  function createAnnotations(projectId, taskId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多创建 50 个批注");
    // 任务必须存在且属于该项目（与 deleteAnnotations 对齐，避免 FK 错误与跨项目写入）
    getTaskOrThrow(projectId, taskId);
    // V2.1 规则：任务已完成不允许挂载便利贴
    const t = db.prepare("SELECT done FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId);
    if (t && t.done) throw new Error(`任务已完成，不能挂载便利贴`);
    // 先整体校验内容，避免事务中途失败
    for (const [i, it] of items.entries()) {
      if (!it || typeof it.content !== "string" || !it.content.trim()) {
        throw new Error(`第 ${i + 1} 个批注内容不能为空`);
      }
    }
    // 事务内逐个创建（复用 createAnnotation 校验与 trim 逻辑）
    return db.transaction(() => items.map((it) => createAnnotation(projectId, taskId, it)))();
  }

  /**
   * 批量删除批注（单个不存在不阻断后续，收集 notFound）
   * @param {string} projectId
   * @param {string} taskId
   * @param {string[]} ids 最多 50 个
   * @returns {{deleted: string[], notFound: string[]}}
   */
  function deleteAnnotations(projectId, taskId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids 不能为空");
    if (ids.length > 50) throw new Error("单次最多删除 50 个批注");
    // 重复 id 去重，避免同一 id 同时进 deleted 与 notFound
    const uniqueIds = Array.from(new Set(ids));
    // 任务不存在属于整体错误，直接抛出
    getTaskOrThrow(projectId, taskId);
    const deleted = [];
    const notFound = [];
    for (const id of uniqueIds) {
      try {
        deleteAnnotation(projectId, taskId, id);
        deleted.push(id);
      } catch (e) {
        // 仅「不存在」类错误归入 notFound，其余（DB 错误等）整体抛出
        if (/不存在$/.test(e.message) || /批注.*不存在/.test(e.message)) {
          notFound.push(id);
        } else {
          throw e;
        }
      }
    }
    return { deleted, notFound };
  }

  /**
   * 批量确认批注（V2.1.2）：解决任务完成前置校验（全部便利贴须已确认）逐个确认的痛点
   * 范围：ids 优先（指定批注）→ 无 ids 有 taskId（该任务全部未确认）→ 都无（项目全部未确认）
   * 事务 + 冻结校验：任一确认失败（含已完成任务冻结）整体回滚
   * @param {string} projectId
   * @param {{taskId?: string, ids?: string[]}} opts
   * @returns {{confirmed: string[], count: number}}
   */
  function confirmAnnotations(projectId, opts = {}) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const ids = Array.isArray(opts.ids) ? Array.from(new Set(opts.ids)).slice(0, 50) : [];
    const taskId = opts.taskId ? String(opts.taskId) : "";

    // 收集目标批注（附所属任务，冻结校验用）
    let rows = [];
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      rows = db.prepare(`
        SELECT a.id, a.task_id FROM annotations a
        JOIN tasks t ON t.id = a.task_id
        WHERE a.id IN (${ph}) AND t.project_id = ?
      `).all(...ids, projectId);
      // 未找到（跨项目/不存在）→ 明确报错，避免静默吞掉
      if (rows.length !== ids.length) throw new Error("部分批注不存在或不属于该项目");
    } else if (taskId) {
      getTaskOrThrow(projectId, taskId);
      rows = db.prepare("SELECT id, task_id FROM annotations WHERE task_id = ? AND confirmed = 0").all(taskId);
    } else {
      rows = db.prepare(`
        SELECT a.id, a.task_id FROM annotations a
        JOIN tasks t ON t.id = a.task_id
        WHERE t.project_id = ? AND a.confirmed = 0
      `).all(projectId);
    }
    if (rows.length === 0) return { confirmed: [], count: 0 };

    // 事务 + 冻结校验（逐条走 updateAnnotation 语义：任务已完成 → confirmed 冻结）
    const run = db.transaction(() => {
      const confirmed = [];
      for (const r of rows) {
        const task = db.prepare("SELECT done FROM tasks WHERE id = ?").get(r.task_id);
        if (task && task.done) throw new Error(`任务已完成，便利贴已冻结（无法确认）`);
        db.prepare("UPDATE annotations SET confirmed = 1 WHERE id = ? AND task_id = ?").run(r.id, r.task_id);
        confirmed.push(r.id);
      }
      return confirmed;
    });
    const confirmed = run();
    logAudit(projectId, "批量确认批注", "annotation", null, null, JSON.stringify({ count: confirmed.length, ids: confirmed }));
    return { confirmed, count: confirmed.length };
  }

  /**
   * 批量更新批注（V2.2 R7，逐条独立语义）
   * - 每条走 updateAnnotation 校验（含任务已完成冻结），冻结条目标失败、其余成功
   * - 归属校验：批注须属于项目内任务（跨项目拒绝）
   * @param {string} projectId
   * @param {Array<{id: string, content?, kind?, confirmed?}>} items 最多 50 条
   * @returns {{success: Array<{id:string,taskId:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function updateAnnotations(projectId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("annotations 不能为空");
    if (items.length > 50) throw new Error("单次最多更新 50 个批注");
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const locate = db.prepare(`
      SELECT a.id, a.task_id, t.project_id
      FROM annotations a JOIN tasks t ON t.id = a.task_id
      WHERE a.id = ?
    `);
    const success = [];
    const failed = [];
    items.forEach((it, i) => {
      const index = i + 1;
      if (!it || !it.id) {
        failed.push({ id: it?.id || null, index, error: "缺少批注 ID" });
        return;
      }
      try {
        const row = locate.get(it.id);
        if (!row || row.project_id !== projectId) throw new Error(`批注 ${it.id} 不存在或不属于该项目`);
        updateAnnotation(row.task_id, it.id, { content: it.content, kind: it.kind, confirmed: it.confirmed });
        success.push({ id: it.id, taskId: row.task_id });
      } catch (e) {
        failed.push({ id: it.id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  return {
    normalizeAnnotationKind,
    getTaskAnnotations,
    getProjectAnnotations,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    createAnnotations,
    deleteAnnotations,
    confirmAnnotations,
    updateAnnotations,
  };
}
