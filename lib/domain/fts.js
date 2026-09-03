// 全文检索（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createFtsModule(ctx) {
  const { db, escapeLike, htmlToPlain, truncateText } = ctx;
  // ===== 全文检索（V2.3 R2）=====

  /**
   * 标记项目索引为脏（写操作经 logAudit 统一注入，一行全覆盖，不动各写方法）
   * 有 projectId 时 INSERT OR REPLACE fts_dirty；写失败静默（索引是旁路能力，不影响业务）
   * @param {string|null} projectId 归属项目（可空：全局成员/项目集操作无项目归属，不标脏）
   */
  function markFtsDirty(projectId) {
    if (!projectId) return;
    try {
      db.prepare("INSERT OR REPLACE INTO fts_dirty (project_id, updated_at) VALUES (?, ?)")
        .run(projectId, new Date().toISOString());
    } catch (e) {
      console.warn("[fts] 索引脏标记失败（不影响业务）:", e.message);
    }
  }

  /**
   * 重建单个项目的 FTS 索引条目（6 类业务数据 + 项目自身，title/body 映射）
   * 先删该项目旧条目（FTS5 删除受限，须按 rowid 逐行删），再全量插入；事务内调用
   * @param {string} projectId
   */
  function insertFtsEntries(projectId) {
    const ins = db.prepare(
      "INSERT INTO fts_entries (entry_id, project_id, type, ref_id, title, body) VALUES (?, ?, ?, ?, ?, ?)"
    );
    // project：项目名 + 描述（V2.3 全局搜索优化：项目名纳入索引；refId=项目 id，跳转=打开项目页）
    const proj = db.prepare("SELECT id, name, description FROM projects WHERE id = ?").get(projectId);
    if (proj) {
      ins.run(`project|${proj.id}`, projectId, "project", proj.id, proj.name, htmlToPlain(proj.description));
    }
    // task：name + description（剥 HTML）；全表查询天然平铺子任务
    for (const t of db.prepare("SELECT id, name, description FROM tasks WHERE project_id = ?").all(projectId)) {
      ins.run(`task|${t.id}`, projectId, "task", t.id, t.name, htmlToPlain(t.description));
    }
    // annotation：content 剥 HTML（JOIN tasks 取项目归属）
    for (const a of db.prepare(`
      SELECT a.id, a.content FROM annotations a
      JOIN tasks t ON t.id = a.task_id
      WHERE t.project_id = ?
    `).all(projectId)) {
      ins.run(`annotation|${a.id}`, projectId, "annotation", a.id, truncateText(htmlToPlain(a.content), 80), htmlToPlain(a.content));
    }
    // plan：title + 剥 HTML content
    for (const p of db.prepare("SELECT id, title, content FROM plans WHERE project_id = ?").all(projectId)) {
      ins.run(`plan|${p.id}`, projectId, "plan", p.id, p.title, htmlToPlain(p.content));
    }
    // requirement：name + description
    for (const r of db.prepare("SELECT id, name, description FROM requirements WHERE project_id = ?").all(projectId)) {
      ins.run(`requirement|${r.id}`, projectId, "requirement", r.id, r.name, htmlToPlain(r.description));
    }
    // note：content 剥 HTML
    for (const n of db.prepare("SELECT id, content FROM notes WHERE project_id = ?").all(projectId)) {
      ins.run(`note|${n.id}`, projectId, "note", n.id, truncateText(htmlToPlain(n.content), 80), htmlToPlain(n.content));
    }
    // file：仅 name（不索引内容）
    for (const f of db.prepare("SELECT id, name FROM files WHERE project_id = ?").all(projectId)) {
      ins.run(`file|${f.id}`, projectId, "file", f.id, f.name, "");
    }
    // comment：统一评论（需求/方案共用，V2.6）：title=截断内容，body=全文；ref_id 存 target_type|target_id 供跳转定位
    for (const c of db.prepare("SELECT id, target_type, target_id, content FROM comments WHERE project_id = ?").all(projectId)) {
      ins.run(`comment|${c.id}`, projectId, "comment", `${c.target_type}|${c.target_id}`,
        truncateText(htmlToPlain(c.content), 80), htmlToPlain(c.content));
    }
    // verification：验证卡名称 + 备注（V2.6.1）
    for (const v of db.prepare("SELECT id, name, note FROM verifications WHERE project_id = ?").all(projectId)) {
      ins.run(`verification|${v.id}`, projectId, "verification", v.id,
        truncateText(v.name, 80), [v.name, v.note].filter(Boolean).join(" "));
    }
    // verification_item：验证项内容，ref_id=所属验证卡 id（V2.6.1 快速搜索）
    for (const it of db.prepare(`
      SELECT vi.id, vi.content, vi.verification_id FROM verification_items vi
      JOIN verifications v ON v.id = vi.verification_id
      WHERE v.project_id = ?
    `).all(projectId)) {
      ins.run(`verification_item|${it.id}`, projectId, "verification_item", it.verification_id,
        truncateText(it.content, 80), it.content);
    }
    // verification_category：分类名（V2.6.1 分组管理）
    for (const c2 of db.prepare("SELECT id, name FROM verification_categories WHERE project_id = ?").all(projectId)) {
      ins.run(`verification_category|${c2.id}`, projectId, "verification_category", c2.name, c2.name, c2.name);
    }
  }

  /**
   * 重建 FTS 索引
   * - 传 projectId：只重建该项目（删除旧条目 → 全量重插 → 清脏标记），毫秒级
   * - 不传：全部项目重建 + 置 fts_meta full_indexed=1（首次全量建索引，后台跑一次）
   * @param {string} [projectId]
   * @returns {boolean}
   */
  function rebuildFtsIndex(projectId) {
    if (projectId) {
      db.transaction(() => {
        // FTS5 不支持 DELETE WHERE 任意条件（须 MATCH/rowid），先取 rowid 再逐行删
        const oldRows = db.prepare("SELECT rowid FROM fts_entries WHERE project_id = ?").all(projectId);
        const del = db.prepare("DELETE FROM fts_entries WHERE rowid = ?");
        for (const r of oldRows) del.run(r.rowid);
        insertFtsEntries(projectId);
        db.prepare("DELETE FROM fts_dirty WHERE project_id = ?").run(projectId);
      })();
      return true;
    }
    db.transaction(() => {
      db.exec("DELETE FROM fts_entries");
      const projects = db.prepare("SELECT id FROM projects").all();
      for (const p of projects) insertFtsEntries(p.id);
      // 临时任务（全局数据，不挂项目）：project_id=''，type='quick-task'
      const insQt = db.prepare(
        "INSERT INTO fts_entries (entry_id, project_id, type, ref_id, title, body) VALUES (?, '', 'quick-task', ?, ?, ?)"
      );
      for (const q of db.prepare("SELECT id, content FROM quick_tasks").all()) {
        insQt.run(`quick-task|${q.id}`, q.id, truncateText(q.content, 80), q.content);
      }
      db.exec("DELETE FROM fts_dirty");
      db.prepare("INSERT OR REPLACE INTO fts_meta (key, value) VALUES ('full_indexed', '1')").run();
    })();
    return true;
  }

  /**
   * 确保 FTS 全量索引就绪（路由层启动时 setTimeout 异步调用，非阻塞）
   * fts_meta 无 full_indexed=1 时触发全量重建（老库升级 / 首次启动）
   * @returns {{rebuilt: boolean, reason: string}}
   */
  function ensureFtsReady() {
    const row = db.prepare("SELECT value FROM fts_meta WHERE key = 'full_indexed'").get();
    if (row && row.value === "1") return { rebuilt: false, reason: "already-indexed" };
    rebuildFtsIndex();
    return { rebuilt: true, reason: "full-rebuilt" };
  }

  /**
   * keyword → FTS5 MATCH 短语表达式（双引号包裹 + 内部引号转义，其余特殊字符在短语内为字面量）
   * trigram 分词下 ≥3 字词才可能命中（<3 由调用方走 LIKE 兜底）
   */
  function toFtsPhrase(kw) {
    // FTS5 短语内字面双引号用 "" 转义；其余特殊字符在引号内均为字面量
    return `"${String(kw).replace(/"/g, '""')}"`;
  }

  /**
   * FTS5 主路径：MATCH + bm25 排序 + snippet 高亮（body 是第 5 列，0-based；写错列会空白）
   */
  function ftsSearch(kw, { projectId, type, limit }) {
    const conds = ["fts_entries MATCH ?"];
    const params = [toFtsPhrase(kw)];
    if (projectId) { conds.push("project_id = ?"); params.push(projectId); }
    if (type) { conds.push("type = ?"); params.push(type); }
    params.push(limit);
    const rows = db.prepare(`
      SELECT entry_id, project_id, type, ref_id, title,
             snippet(fts_entries, 5, '<mark>', '</mark>', '…', 24) AS snip,
             (SELECT name FROM projects WHERE id = fts_entries.project_id) AS project_name
      FROM fts_entries
      WHERE ${conds.join(" AND ")}
      ORDER BY bm25(fts_entries)
      LIMIT ?
    `).all(...params);
    return rows.map((r) => ({
      type: r.type,
      projectId: r.project_id,
      projectName: r.project_name || "",
      refId: r.ref_id,
      title: r.title,
      snippet: r.snip || "",
    }));
  }

  /**
   * LIKE 兜底：keyword <3 字（trigram 无法切分）时逐业务表模糊匹配，结果形态与 FTS 一致
   * 复用 escapeLike + ESCAPE '\'；title 高亮命中词，snippet 给 title（保持 UI 一致）
   * annotation/note 为富文本：SQL 粗查（原文 LIKE）→ JS 剥 HTML 后精筛（避免标签/属性误命中）→ 截断 80 字
   * project：项目名/描述 LIKE（V2.3 全局搜索优化：项目名纳入索引）
   */
  function likeSearch(kw, { projectId, type, limit }) {
    const like = `%${escapeLike(kw)}%`;
    const out = [];
    // 无 HTML 字段（name/title）：直接展示 + 高亮
    const push = (rows, t) => {
      for (const r of rows) {
        const title = r.title;
        out.push({
          type: t,
          projectId: r.project_id,
          projectName: r.project_name || "",
          refId: r.ref_id,
          title,
          snippet: String(title).replace(kw, "<mark>$&</mark>"),
        });
      }
    };
    // 富文本字段：剥 HTML → 纯文本精筛（LIKE 命中标签/属性时剔除）→ 截断 80 字展示
    const pushPlain = (rows, t) => {
      for (const r of rows) {
        const text = htmlToPlain(r.raw);
        if (!text.includes(kw)) continue;
        const title = truncateText(text, 80);
        out.push({
          type: t,
          projectId: r.project_id,
          projectName: r.project_name || "",
          refId: r.ref_id,
          title,
          snippet: String(title).replace(kw, "<mark>$&</mark>"),
        });
      }
    };
    const projCond = projectId ? "AND p.id = ?" : "";
    const projParams = projectId ? [projectId] : [];
    const want = (t) => !type || type === t;

    if (want("project")) {
      push(db.prepare(`
        SELECT p.id AS ref_id, p.name AS title, p.id AS project_id, p.name AS project_name
        FROM projects p
        WHERE (p.name LIKE ? ESCAPE '\\' OR COALESCE(p.description, '') LIKE ? ESCAPE '\\') ${projCond}
      `).all(like, like, ...projParams), "project");
    }
    if (want("task")) {
      push(db.prepare(`
        SELECT t.id AS ref_id, t.name AS title, p.id AS project_id, p.name AS project_name
        FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE (t.name LIKE ? ESCAPE '\\' OR COALESCE(t.description, '') LIKE ? ESCAPE '\\') ${projCond}
      `).all(like, like, ...projParams), "task");
    }
    if (want("annotation")) {
      pushPlain(db.prepare(`
        SELECT a.id AS ref_id, a.content AS raw, p.id AS project_id, p.name AS project_name
        FROM annotations a
        JOIN tasks t ON t.id = a.task_id
        JOIN projects p ON p.id = t.project_id
        WHERE a.content LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "annotation");
    }
    if (want("plan")) {
      push(db.prepare(`
        SELECT pl.id AS ref_id, pl.title AS title, p.id AS project_id, p.name AS project_name
        FROM plans pl JOIN projects p ON p.id = pl.project_id
        WHERE (pl.title LIKE ? ESCAPE '\\' OR COALESCE(pl.content, '') LIKE ? ESCAPE '\\') ${projCond}
      `).all(like, like, ...projParams), "plan");
    }
    if (want("requirement")) {
      push(db.prepare(`
        SELECT r.id AS ref_id, r.name AS title, p.id AS project_id, p.name AS project_name
        FROM requirements r JOIN projects p ON p.id = r.project_id
        WHERE (r.name LIKE ? ESCAPE '\\' OR COALESCE(r.description, '') LIKE ? ESCAPE '\\') ${projCond}
      `).all(like, like, ...projParams), "requirement");
    }
    if (want("note")) {
      pushPlain(db.prepare(`
        SELECT n.id AS ref_id, n.content AS raw, p.id AS project_id, p.name AS project_name
        FROM notes n JOIN projects p ON p.id = n.project_id
        WHERE n.content LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "note");
    }
    if (want("file")) {
      push(db.prepare(`
        SELECT f.id AS ref_id, f.name AS title, p.id AS project_id, p.name AS project_name
        FROM files f JOIN projects p ON p.id = f.project_id
        WHERE f.name LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "file");
    }
    // 临时任务：全局数据不挂项目（project_id 空串）
    if (want("quick-task")) {
      push(db.prepare(`
        SELECT q.id AS ref_id, q.content AS title, '' AS project_id, '' AS project_name
        FROM quick_tasks q
        WHERE q.content LIKE ? ESCAPE '\\'
      `).all(like), "quick-task");
    }
    // 统一评论（V2.6）：需求/方案共用；ref_id=target_type|target_id 供跳转定位
    if (want("comment")) {
      push(db.prepare(`
        SELECT c.target_type || '|' || c.target_id AS ref_id, c.content AS title, p.id AS project_id, p.name AS project_name
        FROM comments c JOIN projects p ON p.id = c.project_id
        WHERE c.content LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "comment");
    }
    // 验证卡（V2.6.1）：名称 + 备注
    if (want("verification")) {
      push(db.prepare(`
        SELECT v.id AS ref_id, v.name AS title, p.id AS project_id, p.name AS project_name
        FROM verifications v JOIN projects p ON p.id = v.project_id
        WHERE (v.name LIKE ? ESCAPE '\\' OR COALESCE(v.note, '') LIKE ? ESCAPE '\\') ${projCond}
      `).all(like, like, ...projParams), "verification");
    }
    // 验证项（V2.6.1）：内容；ref_id=所属验证卡
    if (want("verification_item")) {
      push(db.prepare(`
        SELECT vi.verification_id AS ref_id, vi.content AS title, p.id AS project_id, p.name AS project_name
        FROM verification_items vi
        JOIN verifications v ON v.id = vi.verification_id
        JOIN projects p ON p.id = v.project_id
        WHERE vi.content LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "verification_item");
    }
    // 验证分类（V2.6.1 分组管理）：ref_id=分类名
    if (want("verification_category")) {
      push(db.prepare(`
        SELECT vc.name AS ref_id, vc.name AS title, p.id AS project_id, p.name AS project_name
        FROM verification_categories vc JOIN projects p ON p.id = vc.project_id
        WHERE vc.name LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "verification_category");
    }
    return out.slice(0, limit);
  }

  /**
   * 全类型全文检索（V2.3 R2）：项目/任务/批注/方案/需求/备注/临时任务 + 文件名统一搜索
   * 先对全部脏项目增量重建索引（同步，保证结果新鲜），再按 keyword 长度分流：
   * - ≥3 字：FTS5 MATCH（trigram）+ bm25 排序 + snippet 高亮
   * - <3 字：LIKE 逐表兜底（trigram 无法切分 1~2 字）
   * keyword 为空返回空结果（不报错）
   * @param {string} keyword
   * @param {{projectId?: string, type?: string, limit?: number}} [opts]
   * @returns {{indexed: number, fullIndexed: boolean, total: number, results: Array<{type, projectId, projectName, refId, title, snippet}>}}
   */
  function searchAll(keyword, opts = {}) {
    const kw = String(keyword ?? "").trim();
    const limit = Number.isInteger(opts.limit) && opts.limit >= 1 ? Math.min(opts.limit, 100) : 20;
    const fullIndexed = ftsFullIndexed();
    if (!kw) return { indexed: indexedProjectCount(), fullIndexed, total: 0, results: [] };

    // 先重建脏项目（保证增量写操作对搜索可见）
    const dirty = db.prepare("SELECT project_id FROM fts_dirty").all();
    for (const d of dirty) rebuildFtsIndex(d.project_id);

    const results = kw.length >= 3
      ? ftsSearch(kw, { projectId: opts.projectId, type: opts.type, limit })
      : likeSearch(kw, { projectId: opts.projectId, type: opts.type, limit });
    return { indexed: indexedProjectCount(), fullIndexed, total: results.length, results };
  }

  /** fts_meta 全量索引标志（false=首次全量尚未完成，UI 显示建索引动效） */
  function ftsFullIndexed() {
    const row = db.prepare("SELECT value FROM fts_meta WHERE key = 'full_indexed'").get();
    return !!(row && row.value === "1");
  }

  /** 已建索引的项目数（fts_entries DISTINCT project_id，UI 与项目总数对比可判断索引进度） */
  function indexedProjectCount() {
    return db.prepare("SELECT COUNT(DISTINCT project_id) c FROM fts_entries").get().c;
  }

  return {
    markFtsDirty,
    insertFtsEntries,
    rebuildFtsIndex,
    ensureFtsReady,
    toFtsPhrase,
    ftsSearch,
    likeSearch,
    searchAll,
    ftsFullIndexed,
    indexedProjectCount,
  };
}
