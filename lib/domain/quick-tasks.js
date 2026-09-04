// Quick Tasks（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createQuickTasksModule(ctx) {
  const { db, shortId, truncateText } = ctx;
  const createTask = (...a) => ctx.createTask(...a);
  // ===== Quick Tasks（临时任务） =====

  // 状态四态：active（未完成）/ done（已完成）/ converted（已转化）/ archived（已归档）
  const QUICK_TASK_STATUSES = new Set(["active", "done", "converted", "archived"]);

  function quickNow() {
    return new Date().toISOString();
  }

  function quickRow(r) {
    return {
      id: r.id,
      content: r.content,
      status: r.status,
      doneAt: r.done_at || null,
      archivedAt: r.archived_at || null,
      convertedTaskId: r.converted_task_id || null,
      convertedProject: r.converted_project || null,
      convertedProjectId: r.converted_project_id || null,
      createdAt: r.created_at,
    };
  }

  function getQuickTaskRow(id) {
    const row = db.prepare("SELECT * FROM quick_tasks WHERE id = ?").get(id);
    if (!row) throw new Error(`临时任务 ${id} 不存在`);
    return row;
  }

  /**
   * 同步临时任务 FTS 条目（实时维护，不依赖项目脏标记）
   * row 传 null 表示删除条目
   */
  function syncQuickTaskFts(row) {
    if (!row) return;
    const entryId = `quick-task|${row.id}`;
    const oldRows = db.prepare("SELECT rowid FROM fts_entries WHERE entry_id = ?").all(entryId);
    const del = db.prepare("DELETE FROM fts_entries WHERE rowid = ?");
    for (const r of oldRows) del.run(r.rowid);
    db.prepare(
      "INSERT INTO fts_entries (entry_id, project_id, type, ref_id, title, body) VALUES (?, '', 'quick-task', ?, ?, ?)"
    ).run(entryId, row.id, truncateText(row.content, 80), row.content);
  }

  function removeQuickTaskFts(id) {
    const oldRows = db.prepare("SELECT rowid FROM fts_entries WHERE entry_id = ?").all(`quick-task|${id}`);
    const del = db.prepare("DELETE FROM fts_entries WHERE rowid = ?");
    for (const r of oldRows) del.run(r.rowid);
  }

  /**
   * 主列表：active + done + converted 全量（不分页，前端拆未完成/已完成折叠区）
   */
  function listQuickTasks() {
    const rows = db.prepare(
      "SELECT * FROM quick_tasks WHERE status != 'archived' ORDER BY created_at ASC"
    ).all();
    return rows.map(quickRow);
  }

  function createQuickTask(data) {
    const content = String(data.content || "").trim();
    if (!content) throw new Error("临时任务内容不能为空");
    const task = {
      id: shortId(),
      content,
      status: "active",
      created_at: quickNow(),
    };
    db.prepare(
      "INSERT INTO quick_tasks (id, content, status, created_at) VALUES (?, ?, ?, ?)"
    ).run(task.id, task.content, task.status, task.created_at);
    syncQuickTaskFts(task);
    return quickRow(task);
  }

  /**
   * 更新：编辑内容 / 完成 / 退回（双向）
   * - action=complete：active → done（记 done_at）
   * - action=reopen：done → active（清 done_at）；converted 已在正式侧产生任务记录，不可退回
   */
  function updateQuickTask(id, data) {
    const cur = getQuickTaskRow(id);
    if (data.content !== undefined) {
      const content = String(data.content || "").trim();
      if (!content) throw new Error("临时任务内容不能为空");
      db.prepare("UPDATE quick_tasks SET content = ? WHERE id = ?").run(content, id);
    }
    if (data.action === "complete") {
      if (cur.status !== "active") throw new Error("仅未完成任务可标记完成");
      db.prepare("UPDATE quick_tasks SET status = 'done', done_at = ? WHERE id = ?").run(quickNow(), id);
    } else if (data.action === "reopen") {
      if (cur.status === "converted") throw new Error("已转化的任务不可退回，请到目标项目处理");
      if (cur.status !== "done") throw new Error("仅已完成任务可退回");
      db.prepare("UPDATE quick_tasks SET status = 'active', done_at = NULL WHERE id = ?").run(id);
    }
    syncQuickTaskFts(getQuickTaskRow(id));
    return quickRow(getQuickTaskRow(id));
  }

  /**
   * 删除：active/done/converted 均可直删（气泡【删除】按钮）；archived 走归档弹窗删除
   */
  function deleteQuickTask(id) {
    const cur = getQuickTaskRow(id);
    if (cur.status === "archived") {
      throw new Error("已归档任务请通过归档弹窗删除");
    }
    db.prepare("DELETE FROM quick_tasks WHERE id = ?").run(id);
    removeQuickTaskFts(id);
    return true;
  }

  function archiveQuickTask(id) {
    const cur = getQuickTaskRow(id);
    if (cur.status !== "done" && cur.status !== "converted") {
      throw new Error("仅已完成/已转化任务可归档");
    }
    db.prepare("UPDATE quick_tasks SET status = 'archived', archived_at = ? WHERE id = ?").run(quickNow(), id);
    return quickRow(getQuickTaskRow(id));
  }

  /**
   * 批量归档：ids 指定 或 all=true 归档全部 done/converted
   */
  function archiveQuickTasks(params) {
    const now = quickNow();
    let ids = [];
    if (params.all) {
      ids = db.prepare(
        "SELECT id FROM quick_tasks WHERE status IN ('done', 'converted')"
      ).all().map((r) => r.id);
    } else if (Array.isArray(params.ids) && params.ids.length) {
      ids = params.ids;
    } else {
      throw new Error("请指定 ids 或 all=true");
    }
    const upd = db.prepare(
      "UPDATE quick_tasks SET status = 'archived', archived_at = ? WHERE id = ? AND status IN ('done', 'converted')"
    );
    const tx = db.transaction(() => {
      for (const id of ids) {
        upd.run(now, id);
        syncQuickTaskFts(getQuickTaskRow(id));
      }
    });
    tx();
    return { archived: ids.length };
  }

  /**
   * 归档列表：后端分页 + 内容 LIKE 模糊搜索
   */
  function listArchivedQuickTasks(params) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const keyword = String(params.keyword || "").trim();
    const where = keyword ? "WHERE status = 'archived' AND content LIKE ?" : "WHERE status = 'archived'";
    const like = `%${keyword}%`;
    const total = keyword
      ? db.prepare(`SELECT COUNT(*) AS n FROM quick_tasks ${where}`).get(like).n
      : db.prepare(`SELECT COUNT(*) AS n FROM quick_tasks ${where}`).get().n;
    const rows = db.prepare(
      `SELECT * FROM quick_tasks ${where} ORDER BY archived_at DESC LIMIT ? OFFSET ?`
    ).all(...(keyword ? [like] : []), pageSize, (page - 1) * pageSize);
    return { total, page, pageSize, items: rows.map(quickRow) };
  }

  /**
   * 删除归档数据：单条 或 全部（均仅限 archived）
   */
  function deleteArchivedQuickTasks(params) {
    if (params.all) {
      const rows = db.prepare("SELECT id FROM quick_tasks WHERE status = 'archived'").all();
      const n = db.prepare("DELETE FROM quick_tasks WHERE status = 'archived'").run().changes;
      for (const r of rows) removeQuickTaskFts(r.id);
      return { deleted: n, notFound: [] };
    }
    const id = params.id;
    if (!id) throw new Error("请指定 id 或 all=true");
    const cur = db.prepare("SELECT status FROM quick_tasks WHERE id = ?").get(id);
    if (!cur) return { deleted: 0, notFound: [id] };
    if (cur.status !== "archived") throw new Error("仅归档数据可删除");
    db.prepare("DELETE FROM quick_tasks WHERE id = ?").run(id);
    removeQuickTaskFts(id);
    return { deleted: 1, notFound: [] };
  }

  /**
   * 转正式任务：事务内「目标项目建任务 + 回写转化去向」，任一步失败整体回滚
   * - 仅 active/done 可转化；archived 不可
   * - 优先级默认 P3；名称默认用临时任务内容
   */
  function convertQuickTask(id, params) {
    const cur = getQuickTaskRow(id);
    if (cur.status === "archived") throw new Error("已归档任务不可转化");
    if (cur.status === "converted") throw new Error("该任务已转化过");
    const projectId = String(params.projectId || "").trim();
    if (!projectId) throw new Error("请选择目标项目");
    const projExists = db.prepare("SELECT id, name FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const name = String(params.name || "").trim() || cur.content;
    if (!name) throw new Error("任务名称不能为空");
    const priority = String(params.priority || "P3").trim();
    if (!/^P[0-5]$/.test(priority)) throw new Error("优先级格式应为 P0-P5");

    let taskId = null;
    const tx = db.transaction(() => {
      const task = createTask(projectId, { name, priority });
      taskId = task.id;
      db.prepare(
        "UPDATE quick_tasks SET status = 'converted', done_at = COALESCE(done_at, ?), converted_task_id = ?, converted_project = ?, converted_project_id = ? WHERE id = ?"
      ).run(quickNow(), taskId, projExists.name, projectId, id);
    });
    tx();
    syncQuickTaskFts(getQuickTaskRow(id));
    return { quickTask: quickRow(getQuickTaskRow(id)), taskId };
  }

  // ===== 批量操作（V2.6.2，范式对齐 tasks 模块）=====

  /**
   * 批量创建临时任务（事务包裹：任一条失败整体回滚，对齐 createTasks 范式）
   * @param {Array<{content: string}>} items 最多 50 条
   * @returns {Array} 创建后的临时任务对象列表
   */
  function createQuickTasks(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多创建 50 个临时任务");
    for (const [i, it] of items.entries()) {
      if (!it || !String(it.content || "").trim()) throw new Error(`第 ${i + 1} 个临时任务缺少内容`);
    }
    return db.transaction(() =>
      items.map((it, i) => {
        try {
          return createQuickTask(it);
        } catch (e) {
          throw new Error(`第 ${i + 1} 个临时任务：${e.message}`);
        }
      })
    )();
  }

  /**
   * 批量更新临时任务（逐条独立语义，对齐 updateTasks 范式）
   * 每条走 updateQuickTask 完整校验（完成/退回/编辑 + 状态限制），单条失败不影响其他条
   * @param {Array<{id: string, content?, action?}>} items 最多 50 条
   * @returns {{success: Array<{id:string,content:string,status:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function updateQuickTasks(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items 不能为空");
    if (items.length > 50) throw new Error("单次最多更新 50 个临时任务");
    const success = [];
    const failed = [];
    items.forEach((it, i) => {
      const index = i + 1;
      if (!it || !it.id) {
        failed.push({ id: it?.id || null, index, error: "缺少临时任务 ID" });
        return;
      }
      try {
        const updated = updateQuickTask(it.id, it);
        success.push({ id: it.id, content: updated.content, status: updated.status });
      } catch (e) {
        failed.push({ id: it.id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  /**
   * 批量删除临时任务（逐条独立语义；active/done/converted 可删，archived 逐条报「请通过归档弹窗删除」）
   * @param {string[]} ids 最多 50 个
   * @returns {{success: Array<{id:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function deleteQuickTasks(ids) {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids 不能为空");
    if (ids.length > 50) throw new Error("单次最多删除 50 个临时任务");
    const success = [];
    const failed = [];
    ids.forEach((id, i) => {
      const index = i + 1;
      if (!id) {
        failed.push({ id: null, index, error: "缺少临时任务 ID" });
        return;
      }
      try {
        deleteQuickTask(id);
        success.push({ id });
      } catch (e) {
        failed.push({ id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  return {
    quickNow,
    quickRow,
    getQuickTaskRow,
    syncQuickTaskFts,
    removeQuickTaskFts,
    listQuickTasks,
    createQuickTask,
    updateQuickTask,
    deleteQuickTask,
    archiveQuickTask,
    archiveQuickTasks,
    listArchivedQuickTasks,
    deleteArchivedQuickTasks,
    convertQuickTask,
    // 批量（V2.6.2）
    createQuickTasks,
    updateQuickTasks,
    deleteQuickTasks,
  };
}
