/**
 * 数据访问层（SQLite 版）
 *
 * - 替代旧的 JSON 文件存储
 * - 对外 API 保持兼容（listProjects / getProject / createProject 等）
 * - getProject 返回的 task 含嵌套 subtasks 数组（前端无需改动）
 * - 支持树形任务（任意层级，通过 parent_task_id 自引用）
 */
import path from "node:path";
import fs from "node:fs";
import { createDb, shortId, tx } from "./db.js";
import { sanitizeHtml, richTextEmpty } from "./sanitize.js";

/**
 * 解析 assignees JSON（写入时 JSON.stringify；读取/解析失败兑底 []）
 * @param {*} raw
 * @returns {string[]}
 */
function parseAssignees(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 项目 members 与任务 assignees 同为 JSON 数组，复用同一解析逻辑（语义别名）
const parseMembers = parseAssignees;
// 项目 session_ids 同为 JSON 字符串数组，复用同一解析逻辑（语义别名，V2.0 S7）
const parseSessionIds = parseMembers;
// 任务优先级等级：P0 最急 → P5 最缓，字符串序即等级序（V2.0 任务等级）
const PRIORITY_LEVELS = ["P0", "P1", "P2", "P3", "P4", "P5"];

/**
 * 归一化项目成员数组：数组校验 + trim + 去重（P2-2/3）
 * @param {*} members
 * @returns {string[]}
 */
function normalizeMembers(members) {
  if (members === undefined || members === null) return [];
  if (!Array.isArray(members)) throw new Error("成员必须是数组");
  return [...new Set(members.map((m) => String(m).trim()).filter(Boolean))];
}

// ===== status 计算（与旧版一致） =====
// 规则（派生态，不落库，仅展示用）：
//   待开始 + 当前时间超过开始日 00:00:00 → 已延期（要开始没开始）
//   进行中 + 当前时间超过结束日 23:59:59.999 → 已延期（要结束没结束）
//   其余 → 原样返回原始状态，不做自动升级
// 边界：用本地时区解析（开始日当天 00:00，结束日当天 23:59:59.999 含当天）
function computeStatus(project) {
  if (project.status === "已完成") return "已完成";
  if (project.status === "已取消") return "已取消";
  const now = Date.now();
  const start = project.planStart ? new Date(project.planStart + "T00:00:00").getTime() : null;
  const end = project.planEnd ? new Date(project.planEnd + "T23:59:59.999").getTime() : null;
  if (project.status === "待开始" && start && now > start) return "已延期";
  if (project.status === "进行中" && end && now > end) return "已延期";
  return project.status || "待开始";
}

/**
 * LIKE 通配符转义（配合 ESCAPE '\\' 使用）
 * @param {string} str
 * @returns {string}
 */
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, (ch) => "\\" + ch);
}

export function createDataAccess(dataDir) {
  const db = createDb(dataDir);

  /**
   * V2.2 R11 数据自愈：清理无外键级联的悬空引用（幂等、安全，数据访问层每次初始化执行，开销可忽略）
   * - plans.task_id 指向已删任务 → 置空（删除任务后方案可再次转任务）
   * - requirement_plans 指向已删方案/需求 → 删除（删除方案/需求后无关联残留）
   * - task_plans 指向已删任务/方案 → 删除（V2.2 R14；表虽声明了双外键级联，历史库/极端环境残留仍兜底清理）
   * 正常数据（引用仍存在）不受影响。
   */
  function healDanglingReferences() {
    const danglingPlans = db.prepare(`
      SELECT p.id FROM plans p
      WHERE p.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = p.task_id)
    `).all();
    const clearPlanTask = db.prepare("UPDATE plans SET task_id = NULL WHERE id = ?");
    const danglingReqPlans = db.prepare(`
      SELECT rp.requirement_id, rp.plan_id FROM requirement_plans rp
      WHERE NOT EXISTS (SELECT 1 FROM requirements r WHERE r.id = rp.requirement_id)
         OR NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = rp.plan_id)
    `).all();
    const delReqPlan = db.prepare("DELETE FROM requirement_plans WHERE requirement_id = ? AND plan_id = ?");
    const danglingTaskPlans = db.prepare(`
      SELECT tp.task_id, tp.plan_id FROM task_plans tp
      WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = tp.task_id)
         OR NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = tp.plan_id)
    `).all();
    const delTaskPlan = db.prepare("DELETE FROM task_plans WHERE task_id = ? AND plan_id = ?");
    if (danglingPlans.length || danglingReqPlans.length || danglingTaskPlans.length) {
      db.transaction(() => {
        for (const r of danglingPlans) clearPlanTask.run(r.id);
        for (const r of danglingReqPlans) delReqPlan.run(r.requirement_id, r.plan_id);
        for (const r of danglingTaskPlans) delTaskPlan.run(r.task_id, r.plan_id);
      })();
      console.warn(`[data] 数据自愈：清理 ${danglingPlans.length} 个方案悬空 task_id、${danglingReqPlans.length} 条悬空需求-方案关联、${danglingTaskPlans.length} 条悬空任务-方案关联`);
    }
  }

  /**
   * 按 ID 解析单行（V2.2 R11：完整 ID 或唯一前缀，projectId 可空=全局查询）
   * 匹配顺序：精确命中 → 唯一前缀命中 → 多候选抛错（列出候选供调用方用完整 ID 重试）→ 无命中返回 null
   * @param {string} table 表名（仅内部字面量传入，非用户输入，无注入风险）
   * @param {string} idColumn 主键列名（内部字面量）
   * @param {string} projectColumn 项目归属列名（内部字面量）
   * @param {string|null} projectId 项目 ID（null=不按项目过滤）
   * @param {string} id 完整 ID 或前缀
   * @param {string} label 实体中文名（错误提示用）
   * @param {(row:any)=>string} nameOf 从行取展示名（候选提示用）
   * @returns {any|null}
   */
  function resolveRowById(table, idColumn, projectColumn, projectId, id, label, nameOf) {
    const q = String(id ?? "").trim();
    if (!q) throw new Error(`${label} ID 不能为空`);
    const esc = escapeLike(q);
    let rows;
    if (projectId) {
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ? AND ${projectColumn} = ?`).all(q, projectId);
      if (rows.length === 0) {
        rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} LIKE ? ESCAPE '\\' AND ${projectColumn} = ?`).all(`${esc}%`, projectId);
      }
    } else {
      rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).all(q);
      if (rows.length === 0) {
        rows = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} LIKE ? ESCAPE '\\'`).all(`${esc}%`);
      }
    }
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) {
      const cands = rows.map((r) => `${r[idColumn]}（${nameOf(r)}）`).join("、");
      throw new Error(`${label} ID「${q}」前缀匹配到 ${rows.length} 个${label}，请用完整 ID 指定：${cands}`);
    }
    return null;
  }

  healDanglingReferences();

  // ===== 审计日志（V2.1 审计追踪）=====

  /**
   * 审计内容文本化：去 HTML 标签 + 压缩空白 + 截断（防审计表膨胀）
   * @param {*} s
   * @param {number} [max] 最大字符数（默认 120）
   * @returns {string}
   */
  function auditText(s, max = 120) {
    const t = String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }

  /**
   * 写入审计日志（V2.1 审计追踪）
   * - 写操作成功后调用；只记录，绝不改变业务结果
   * - 写入失败静默降级（不影响业务：审计是旁路能力）
   * - projectId 可空：全局成员 / 项目集操作无项目归属，归 NULL（不会出现在任何项目内）
   * @param {string|null} projectId 归属项目（可空）
   * @param {string} action 行为描述（中文动作名，如「创建项目」「更新任务」）
   * @param {string} targetType project/task/annotation/file/note/member/project_set
   * @param {string} targetId 目标 ID
   * @param {string|null} oldValue 旧值 JSON 片段（可空）
   * @param {string|null} newValue 新值 JSON 片段（可空）
   */
  function logAudit(projectId, action, targetType, targetId, oldValue, newValue) {
    if (!action || !targetType) return;
    try {
      db.prepare(`
        INSERT INTO audit_logs (id, project_id, action, target_type, target_id, old_value, new_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        shortId(),
        projectId || null,
        action,
        targetType,
        targetId || null,
        oldValue ?? null,
        newValue ?? null,
        new Date().toISOString()
      );
    } catch (e) {
      console.warn("[audit] 审计写入失败（不影响业务）:", e.message);
    }
    // V2.3 R2：写操作统一标脏对应项目，搜索时增量重建 FTS 索引。
    // 放在 try 之外：审计失败也必须标脏，保证 FTS 一致性（markFtsDirty 自身失败静默）。
    // logAudit 与业务写在同一连接上，即使调用方在事务内也无不一致问题。
    markFtsDirty(projectId);
  }

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
    // comment：统一评论（需求/方案共用，V2.6）：title=截断内容，body=全文
    for (const c of db.prepare("SELECT id, target_type, target_id, content FROM comments WHERE project_id = ?").all(projectId)) {
      ins.run(`comment|${c.id}`, projectId, "comment", c.id,
        truncateText(htmlToPlain(c.content), 80), htmlToPlain(c.content));
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
    // 统一评论（V2.6）：需求/方案共用
    if (want("comment")) {
      push(db.prepare(`
        SELECT c.id AS ref_id, c.content AS title, p.id AS project_id, p.name AS project_name
        FROM comments c JOIN projects p ON p.id = c.project_id
        WHERE c.content LIKE ? ESCAPE '\\' ${projCond}
      `).all(like, ...projParams), "comment");
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

  // ===== 设置（V2.3 精修 #7：消息提醒配置等） =====

  /**
   * 读设置（key/value 键值表）；不存在返回 fallback
   * @param {string} key
   * @param {*} [fallback]
   * @returns {string|null}
   */
  function getSetting(key, fallback = null) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(String(key));
    return row ? row.value : fallback;
  }

  /**
   * 写设置（INSERT OR REPLACE）
   * @param {string} key
   * @param {string|number|boolean} value
   * @returns {boolean}
   */
  function setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(String(key), String(value));
    return true;
  }

  /**
   * 读消息提醒配置（V2.3 精修 #7）：
   * - deadlineDays：到期提醒提前天数（key: deadline_days，默认 3，范围 1-14）
   * - deadlineEnabled / riskEnabled：类型开关（key: deadline_enabled / risk_enabled，默认 true）
   * 配置值非法时回退默认（容错：手工改库/脏值不崩）
   * @returns {{deadlineDays: number, deadlineEnabled: boolean, riskEnabled: boolean}}
   */
  function getMessageConfig() {
    const rawDays = Number(getSetting("deadline_days", 3));
    const deadlineDays = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 14 ? rawDays : 3;
    const parseBool = (v, def) => {
      const s = getSetting(v);
      if (s === null) return def;
      return s === "1" || s === "true";
    };
    return {
      deadlineDays,
      deadlineEnabled: parseBool("deadline_enabled", true),
      riskEnabled: parseBool("risk_enabled", true),
    };
  }

  /**
   * 更新消息提醒配置（局部更新：传哪个改哪个；deadlineDays 校验 1-14）
   * @param {{deadlineDays?: number, deadlineEnabled?: boolean, riskEnabled?: boolean}} cfg
   * @returns {object} 更新后的完整配置
   */
  function updateMessageConfig(cfg = {}) {
    if (cfg.deadlineDays !== undefined) {
      const n = Number(cfg.deadlineDays);
      if (!Number.isInteger(n) || n < 1 || n > 14) throw new Error("deadlineDays 需为 1-14 的整数");
      setSetting("deadline_days", String(n));
    }
    if (cfg.deadlineEnabled !== undefined) setSetting("deadline_enabled", cfg.deadlineEnabled ? "1" : "0");
    if (cfg.riskEnabled !== undefined) setSetting("risk_enabled", cfg.riskEnabled ? "1" : "0");
    return getMessageConfig();
  }

  // ===== 消息中心（V2.3 R1）=====
  // 惰性扫描：打开消息中心 / 调用工具 / 查未读数时触发，按（type + batch_key）幂等去重

  /**
   * 幂等写入一条消息（batch_key UNIQUE + INSERT OR IGNORE，同批次重复扫描不重复插入）
   */
  function insertMessage(msg) {
    db.prepare(`
      INSERT OR IGNORE INTO messages (id, project_id, type, title, content, ref_task_id, ref_plan_id, read, batch_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      shortId(), msg.projectId || null, msg.type, msg.title, msg.content,
      msg.refTaskId || null, msg.refPlanId || null, msg.batchKey, new Date().toISOString()
    );
  }

  /**
   * 惰性扫描生成新消息（deadline 到期提醒 + risk 风险提醒；synergy 预留骨架暂不生成）
   * - deadline：非归档项目中未完成任务 endDate 在 [今天, 今天+提前天数]（deadline_days 配置，默认 3）
   *   → 全部项目聚合 1 条（project_id=NULL）；当日聚合已存在则短路跳过（快照语义，同 batch_key 幂等）
   *   开关 deadline_enabled=false 时不生成（历史消息保留）
   * - risk：仅非归档且原始 status∈{进行中,待开始} 的项目 → summarizeProject 取 level∈{high,medium}
   *   → 跨项目聚合 1 条（project_id=NULL，batch_key=risk|YYYY-MM-DD）；当日已存在则短路跳过
   *   （避免每次打开消息中心全项目 summarizeProject 的性能开销）；开关 risk_enabled=false 时不生成
   * 窗口内无数据则不生成（消息中心保持干净）
   */
  function scanMessages() {
    const today = localToday();
    const cfg = getMessageConfig();

    // —— deadline 聚合（短路：当日快照已生成则跳过扫描）——
    const hasDeadline = db.prepare("SELECT 1 FROM messages WHERE batch_key = ?").get(`deadline|${today}`);
    if (cfg.deadlineEnabled && !hasDeadline) {
      const end = addDays(today, cfg.deadlineDays);
      const tasks = db.prepare(`
        SELECT t.id, t.name, t.end_date, t.project_id, p.name AS project_name
        FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.done = 0 AND p.archived = 0 AND t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        ORDER BY t.end_date, t.name
      `).all(today, end);
      if (tasks.length > 0) {
        const projectCount = new Set(tasks.map((t) => t.project_id)).size;
        insertMessage({
          projectId: null, type: "deadline",
          title: `${projectCount} 个项目共 ${tasks.length} 条任务即将到期`,
          content: tasks.map((t) => `【${t.project_name}】${t.name}（${t.end_date}）`).join("\n"),
          refTaskId: null, refPlanId: null,
          batchKey: `deadline|${today}`,
        });
      }
    }

    // —— risk 聚合（跨项目，PM 拍板：与 deadline 口径一致，所有项目中高风险一天一条；短路跳过已生成）——
    const hasRisk = db.prepare("SELECT 1 FROM messages WHERE batch_key = ?").get(`risk|${today}`);
    if (cfg.riskEnabled && !hasRisk) {
      const riskItems = [];
      for (const p of listProjects()) {
        if (p.archived) continue;
        if (p.status !== "进行中" && p.status !== "待开始") continue;
        const sum = summarizeProject(p.id);
        if (!sum) continue;
        const risks = (sum.risks || []).filter((r) => r.level === "high" || r.level === "medium");
        if (risks.length === 0) continue;
        riskItems.push({ projectId: p.id, projectName: p.name, risks });
      }
      if (riskItems.length > 0) {
        const riskCount = riskItems.reduce((n, x) => n + x.risks.length, 0);
        insertMessage({
          projectId: null, type: "risk",
          title: `${riskItems.length} 个项目共 ${riskCount} 条风险提醒`,
          content: riskItems
            .map((x) => `【${x.projectName}】${x.risks.map((r) => `[${r.level === "high" ? "高" : "中"}] ${r.desc}`).join("；")}`)
            .join("\n"),
          refTaskId: null, refPlanId: null,
          batchKey: `risk|${today}`,
        });
      }
    }
    // synergy（协同通知）：V2.3 预留骨架，当前不生成消息
  }

  /**
   * 列出消息（先惰性扫描，再分页）
   * @param {{projectId?: string, type?: string, limit?: number, offset?: number}} [opts]
   * @returns {{total: number, unread: number, items: Array<{id, projectId, type, title, content, refTaskId, refPlanId, read, createdAt}>}}
   */
  function listMessages(opts = {}) {
    scanMessages();
    const { projectId, type } = opts;
    const limit = Number.isInteger(opts.limit) && opts.limit >= 1 ? Math.min(opts.limit, 100) : 20;
    const offset = Number.isInteger(opts.offset) && opts.offset >= 0 ? opts.offset : 0;
    const where = [];
    const params = [];
    if (projectId) { where.push("project_id = ?"); params.push(projectId); }
    if (type) { where.push("type = ?"); params.push(type); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) c FROM messages ${whereSql}`).get(...params).c;
    const unreadSql = where.length ? `${whereSql} AND read = 0` : "WHERE read = 0";
    const unread = db.prepare(`SELECT COUNT(*) c FROM messages ${unreadSql}`).get(...params).c;
    const rows = db.prepare(`
      SELECT id, project_id, type, title, content, ref_task_id, ref_plan_id, read, created_at
      FROM messages ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    return {
      total,
      unread,
      items: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        type: r.type,
        title: r.title,
        content: r.content,
        refTaskId: r.ref_task_id,
        refPlanId: r.ref_plan_id,
        read: !!r.read,
        createdAt: r.created_at,
      })),
    };
  }

  /**
   * 标记消息已读（批量）
   * @param {string[]} ids
   * @returns {{updated: number}}
   */
  function markMessageRead(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    // read=0 过滤：仅更新未读行，重复标记幂等（changes 反映真实变化数）
    const placeholders = ids.map(() => "?").join(",");
    const r = db.prepare(`UPDATE messages SET read = 1 WHERE id IN (${placeholders}) AND read = 0`).run(...ids);
    return { updated: r.changes };
  }

  /**
   * 删除单条消息（V2.3.1 补审：按消息所属项目留痕，project_id 为空归 NULL 不进项目）
   * @param {string} id
   * @returns {boolean}
   */
  function deleteMessage(id) {
    const row = db.prepare("SELECT id, project_id, title FROM messages WHERE id = ?").get(String(id || ""));
    const r = db.prepare("DELETE FROM messages WHERE id = ?").run(String(id || ""));
    if (r.changes === 0) throw new Error(`消息 ${id} 不存在`);
    if (row) logAudit(row.project_id || null, "删除消息", "message", row.id,
      JSON.stringify({ title: row.title }), null);
    return true;
  }

  /**
   * 未读消息数（先惰性扫描保证新鲜）
   * @param {string} [projectId] 不传=全部项目
   * @returns {number}
   */
  function getMessageUnreadCount(projectId) {
    scanMessages();
    const c = projectId
      ? db.prepare("SELECT COUNT(*) c FROM messages WHERE read = 0 AND project_id = ?").get(projectId).c
      : db.prepare("SELECT COUNT(*) c FROM messages WHERE read = 0").get().c;
    return c;
  }

  // ===== 内部：组装任务树（按 parent_task_id）=====

  /**
   * 把扁平任务数组按 parent_task_id 组装成树（顶层 → children）
   * 同时挂上 fileRefs / annotations / subtasks
   */
  function buildTaskTree(flatTasks, fileRefsMap, annotationsMap, planRefsMap) {
    const byId = new Map();
    // 先创建节点（含 fileRefs / annotations / planRefs）；snake_case 新字段排除，统一输出 camelCase（P2-6）
    for (const t of flatTasks) {
      const { start_date, end_date, assignees, is_milestone, done_at, ...rest } = t;
      byId.set(t.id, {
        ...rest,
        assignees: parseAssignees(assignees),
        startDate: start_date || "",
        endDate: end_date || "",
        isMilestone: !!is_milestone,
        done: !!t.done,
        doneAt: done_at || "",
        fileRefs: fileRefsMap.get(t.id) || [],
        annotations: annotationsMap.get(t.id) || [],
        planRefs: planRefsMap ? (planRefsMap.get(t.id) || []) : [],
        subtasks: [],
      });
    }
    // 父子挂载
    const roots = [];
    for (const t of flatTasks) {
      const node = byId.get(t.id);
      if (t.parent_task_id && byId.has(t.parent_task_id)) {
        byId.get(t.parent_task_id).subtasks.push(node);
      } else {
        roots.push(node);
      }
    }
    // 递归按 index_num 排序
    function sortChildren(arr) {
      arr.sort((a, b) => (a.index_num ?? 0) - (b.index_num ?? 0));
      for (const n of arr) if (n.subtasks?.length) sortChildren(n.subtasks);
    }
    sortChildren(roots);
    return roots;
  }

  /**
   * 取项目下所有任务的 planRefs 映射（task_id → [{id, title, status}, ...]）
   * V2.2 R14：任务↔方案双向关联，任务侧反向展示关联方案
   */
  function getTaskPlanRefsMap(projectId) {
    const rows = db.prepare(`
      SELECT tp.task_id, p.id, p.title, p.status
      FROM task_plans tp
      JOIN plans p ON p.id = tp.plan_id
      JOIN tasks t ON t.id = tp.task_id
      WHERE t.project_id = ?
      ORDER BY p.created_at ASC
    `).all(projectId);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.task_id)) map.set(r.task_id, []);
      map.get(r.task_id).push({ id: r.id, title: r.title, status: r.status });
    }
    return map;
  }

  /**
   * 取项目下所有任务的 fileRefs 映射（task_id → [file_id, ...]）
   */
  function getTaskFileRefsMap(projectId) {
    const rows = db.prepare(`
      SELECT tfr.task_id, tfr.file_id
      FROM task_file_refs tfr
      JOIN tasks t ON t.id = tfr.task_id
      WHERE t.project_id = ?
    `).all(projectId);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.task_id)) map.set(r.task_id, []);
      map.get(r.task_id).push(r.file_id);
    }
    return map;
  }

  /**
   * 取项目下所有任务的批注映射（task_id → [annotation, ...]）
   */
  function getTaskAnnotationsMap(projectId) {
    const rows = db.prepare(`
      SELECT id, task_id, content, confirmed, confirmed_at, created_at, kind
      FROM annotations
      WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
      ORDER BY created_at ASC
    `).all(projectId);
    const map = new Map();
    for (const r of rows) {
      const a = {
        id: r.id,
        content: r.content,
        kind: r.kind || "note",
        confirmed: !!r.confirmed,
        confirmedAt: r.confirmed_at,
        createdAt: r.created_at,
      };
      if (!map.has(r.task_id)) map.set(r.task_id, []);
      map.get(r.task_id).push(a);
    }
    return map;
  }

  /**
   * 取项目下所有任务（扁平）
   */
  function getProjectTasks(projectId) {
    return db.prepare(`
      SELECT id, project_id, parent_task_id, index_num, name, description, done, done_at, assignees, start_date, end_date, priority, is_milestone, created_at
      FROM tasks
      WHERE project_id = ?
    `).all(projectId);
  }

  /**
   * 取项目完整详情（含树形任务、文件、备注）
   */
  function getProjectFull(id) {
    const row = db.prepare(`
      SELECT id, name, description, members, plan_start, plan_end, status, project_set_id, session_ids, archived, archived_at, pinned, created_at
      FROM projects WHERE id = ?
    `).get(id);
    if (!row) return null;

    const flatTasks = getProjectTasks(id);
    const fileRefsMap = getTaskFileRefsMap(id);
    const annotationsMap = getTaskAnnotationsMap(id);
    const planRefsMap = getTaskPlanRefsMap(id);
    const tasks = buildTaskTree(flatTasks, fileRefsMap, annotationsMap, planRefsMap);

    const files = db.prepare(`
      SELECT id, name, path, size, ext, indexed, digest, uploaded_at, folder_id FROM files WHERE project_id = ? ORDER BY uploaded_at DESC
    `).all(id).map(fileRowToObject);

    // 文件夹树（V2.1.4 文件系统重构）：多层嵌套，空项目返回 []
    const folders = listFolders(id);

    const notes = db.prepare(`
      SELECT id, content, created_at FROM notes WHERE project_id = ? ORDER BY created_at DESC
    `).all(id).map((n) => ({
      id: n.id, content: n.content, createdAt: n.created_at,
    }));

    const project = {
      id: row.id,
      name: row.name,
      description: row.description || "",
      members: parseMembers(row.members),
      planStart: row.plan_start || "",
      planEnd: row.plan_end || "",
      status: row.status,
      projectSetId: row.project_set_id || "",
      sessionIds: parseSessionIds(row.session_ids),
      archived: !!row.archived,
      archivedAt: row.archived_at || "",
      pinned: !!row.pinned,
      createdAt: row.created_at,
      tasks,
      files,
      folders,
      notes,
    };
    // 已延期是展示态，只由前端 computeDisplayStatus 计算，接口返回原始状态
    return project;
  }

  /**
   * 计算项目统计（taskCount / incompleteTaskCount / fileCount / noteCount / planCount）
   */
  function getProjectStats(projectId) {
    const taskCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE project_id = ?").get(projectId).c;
    const incompleteTaskCount = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND done = 0"
    ).get(projectId).c;
    const fileCount = db.prepare("SELECT COUNT(*) as c FROM files WHERE project_id = ?").get(projectId).c;
    const noteCount = db.prepare("SELECT COUNT(*) as c FROM notes WHERE project_id = ?").get(projectId).c;
    const planCount = db.prepare("SELECT COUNT(*) as c FROM plans WHERE project_id = ?").get(projectId).c;
    const reqCount = db.prepare("SELECT COUNT(*) as c FROM requirements WHERE project_id = ?").get(projectId).c;
    return { taskCount, incompleteTaskCount, fileCount, noteCount, planCount, reqCount };
  }

  /**
   * 递归计算某任务树（含所有后代）的统计
   */
  function collectDescendantIds(taskId, allTasks) {
    const result = [taskId];
    const queue = [taskId];
    while (queue.length) {
      const cur = queue.shift();
      for (const t of allTasks) {
        if (t.parent_task_id === cur) {
          result.push(t.id);
          queue.push(t.id);
        }
      }
    }
    return result;
  }

  /**
   * 统计任务的未完成后代数量（任意层级，不含自身）
   * V2.2 R7：完成任务前置校验用，防「父完成 + 子未完成」矛盾树（与前端 TaskTab 同款逻辑）
   * @param {string} taskId
   * @param {string} projectId
   * @returns {number} 未完成后代任务数
   */
  function countIncompleteDescendants(taskId, projectId) {
    const allTasks = getProjectTasks(projectId);
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    const descendants = collectDescendantIds(taskId, allTasks).filter((id) => id !== taskId);
    let count = 0;
    for (const id of descendants) {
      const t = byId.get(id);
      if (t && !t.done) count++;
    }
    return count;
  }

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

  // ===== Projects =====

  /**
   * 列出项目（可按项目集筛选 / 按名称模糊匹配 / 按状态过滤）
   * @param {string|undefined} projectSetId 项目集 ID（undefined=全部，空字符串=未归类）
   * @param {string|undefined} keyword 按项目名模糊匹配（可选）
   * @param {string|undefined} status 按状态过滤（待开始/进行中/已完成/已取消，可选）
   */
  function listProjects(projectSetId, keyword, status) {
    const where = [];
    const params = [];
    if (status) {
      const VALID = ["待开始", "进行中", "已完成", "已取消"];
      if (!VALID.includes(status)) throw new Error(`非法状态筛选：${status}（可选：${VALID.join(" / ")}）`);
      where.push("status = ?");
      params.push(status);
    }
    if (projectSetId !== undefined) {
      if (projectSetId === "") {
        // 空字符串 = 未归类：SQLite 中 project_set_id 存 NULL，NULL = '' 恒假，需用 IS NULL
        where.push("project_set_id IS NULL");
      } else {
        where.push("project_set_id = ?");
        params.push(projectSetId);
      }
    }
    const kw = (keyword || "").trim();
    if (kw) {
      where.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(kw)}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT id, name, description, members, plan_start, plan_end, status, project_set_id, archived, archived_at, pinned, created_at
      FROM projects
      ${whereSql}
      ORDER BY created_at DESC
    `).all(...params);
    return rows.map((row) => {
      const project = {
        id: row.id, name: row.name, description: row.description || "",
        members: parseMembers(row.members),
        planStart: row.plan_start || "", planEnd: row.plan_end || "",
        status: row.status, projectSetId: row.project_set_id || "",
        archived: !!row.archived, archivedAt: row.archived_at || "",
        pinned: !!row.pinned,
        createdAt: row.created_at,
      };
      const stats = getProjectStats(row.id);
      // 已延期是展示态，只由前端 computeDisplayStatus 计算，接口返回原始状态
      // V2.4.1：卡片信息区需展示前3条任务/方案/需求标题（供 5 行卡片渲染）
      // 任务按创建时间正序取前3；方案/需求按创建时间倒序取前3（标题字段分别为 name / name / title）
      const topTasks = db.prepare(
        "SELECT name FROM tasks WHERE project_id = ? ORDER BY COALESCE(created_at, '') ASC, id LIMIT 3"
      ).all(row.id).map((r) => r.name);
      const topPlans = db.prepare(
        "SELECT title FROM plans WHERE project_id = ? ORDER BY COALESCE(created_at, '') DESC, id LIMIT 3"
      ).all(row.id).map((r) => r.title);
      const topReqs = db.prepare(
        "SELECT name FROM requirements WHERE project_id = ? ORDER BY COALESCE(created_at, '') DESC, id LIMIT 3"
      ).all(row.id).map((r) => r.name);
      return { ...project, ...stats, topTaskTitles: topTasks, topPlanTitles: topPlans, topRequirementTitles: topReqs };
    });
  }

  function getProject(id) {
    // V2.5.1：支持完整 ID 或唯一短前缀全局查询（对齐 get_plan / get_requirement 的 ID 体系）
    const row = resolveRowById("projects", "id", null, null, id, "项目", (r) => r.name);
    if (!row) return null;
    const full = getProjectFull(row.id);
    if (!full) return null;
    const stats = getProjectStats(row.id);
    // V2.3 R3：需求/方案清单精简映射（接口约定给 T2 get-project 渲染，字段名不可变）
    // 空项目返回空数组（不是 null）；limit 200 覆盖全量
    const requirements = listRequirements(row.id, { limit: 200 }).items.map((r) => ({
      id: r.id, name: r.name, status: r.status, priority: r.priority, planCount: r.planCount,
    }));
    const plans = listPlans(row.id, { limit: 200 }).items.map((p) => ({
      id: p.id, title: p.title, status: p.status, commentCount: p.commentCount, taskName: p.taskName,
    }));
    return { ...full, ...stats, requirements, plans };
  }

  function createProject(data) {
    if (!data.name || !data.name.trim()) throw new Error("项目名称不能为空");
    if (data.name.trim().length > 20) throw new Error("项目名称最多20个字符");
    // 描述：V1.2 起支持富文本 HTML，不再限制长度（原 200 字符限制已移除）
    // P3-1：项目日期格式校验（复用 normalizeDate 的反向比对，拦截溢出日期）
    normalizeDate(data.planStart);
    normalizeDate(data.planEnd);
    // P2-2：项目计划周期硬校验（与任务 endDate>=startDate 一致）
    if (data.planStart && data.planEnd && data.planEnd < data.planStart) {
      throw new Error("项目结束日期不能早于开始日期");
    }
    // P2-6：create 侧 status 同样白名单校验
    const rawStatus = data.status || "待开始";
    if (!["待开始", "进行中", "已完成", "已取消"].includes(rawStatus)) throw new Error("项目状态不合法");
    const project = {
      id: shortId(),
      name: data.name,
      description: sanitizeHtml(data.description),
      members: normalizeMembers(data.members),
      planStart: data.planStart || "",
      planEnd: data.planEnd || "",
      status: rawStatus,
      projectSetId: data.projectSetId || "",
      // 新项目无会话关联（DB 默认 '[]'），内存对象同步字段与 getProjectFull 对齐
      sessionIds: [],
      pinned: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    db.prepare(`
      INSERT INTO projects (id, name, description, members, plan_start, plan_end, status, project_set_id, created_at, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.id, project.name, project.description, JSON.stringify(project.members),
      project.planStart || null, project.planEnd || null,
      project.status, project.projectSetId || null, project.createdAt, 0
    );
    logAudit(project.id, "创建项目", "project", project.id, null, JSON.stringify({
      name: project.name,
      status: project.status,
      members: project.members,
      planStart: project.planStart || null,
      planEnd: project.planEnd || null,
    }));
    // 已延期是展示态，只由前端 computeDisplayStatus 计算，接口返回原始状态
    return project;
  }

  function updateProject(id, data) {
    const cur = getProjectFull(id);
    if (!cur) return null;
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("项目名称不能为空");
      if (data.name.trim().length > 20) throw new Error("项目名称最多20个字符");
    }
    // 描述：V1.2 起支持富文本 HTML，不再限制长度（原 200 字符限制已移除）
    // P3-1：项目日期格式校验
    if (data.planStart !== undefined) normalizeDate(data.planStart);
    if (data.planEnd !== undefined) normalizeDate(data.planEnd);
    // P2-2：合并前后端更新值后校验计划周期
    if (data.planStart !== undefined || data.planEnd !== undefined) {
      const nextStart = data.planStart !== undefined ? data.planStart : (cur.planStart || "");
      const nextEnd = data.planEnd !== undefined ? data.planEnd : (cur.planEnd || "");
      if (nextStart && nextEnd && nextEnd < nextStart) {
        throw new Error("项目结束日期不能早于开始日期");
      }
    }
    const allowed = ["name", "description", "members", "planStart", "planEnd", "status", "projectSetId", "archived", "pinned"];
    const VALID_STATUS = ["待开始", "进行中", "已完成", "已取消"];
    const sets = {};
    const finalValues = {}; // 最终业务值（供审计 diff；archived/pinned 归一为 bool）
    for (const key of allowed) {
      if (data[key] !== undefined) {
        if (key === "status") {
          // P2-6：status 值域白名单（防直连 REST 写入任意字符串）
          if (!VALID_STATUS.includes(data[key])) throw new Error("项目状态不合法");
          sets[key] = data[key];
          finalValues[key] = data[key];
        } else if (key === "archived") {
          // 归档/取消归档：联动 archived_at 时间戳
          sets.archived = data.archived ? 1 : 0;
          sets.archivedAt = data.archived ? new Date().toISOString() : null;
          finalValues.archived = !!data.archived;
        } else if (key === "pinned") {
          // 收藏/取消收藏：0/1 落库（收藏不改变项目状态与分组）
          sets.pinned = data.pinned ? 1 : 0;
          finalValues.pinned = !!data.pinned;
        } else if (key === "members") {
          // P2-2/3：成员数组校验 + trim 去重
          sets[key] = normalizeMembers(data[key]);
          finalValues[key] = sets[key];
        } else if (key === "description") {
          // 描述统一清洗（P0-1：防存储型 XSS）
          sets[key] = sanitizeHtml(data[key]);
          finalValues[key] = sets[key];
        } else {
          sets[key] = data[key];
          finalValues[key] = data[key];
        }
      }
    }
    // 拼 UPDATE
    const map = {
      name: "name", description: "description", members: "members",
      planStart: "plan_start", planEnd: "plan_end", status: "status",
      projectSetId: "project_set_id", archived: "archived", archivedAt: "archived_at", pinned: "pinned",
    };
    const parts = [];
    const params = [];
    for (const [k, v] of Object.entries(sets)) {
      parts.push(`${map[k]} = ?`);
      // archived/pinned 是 0/1（0 不能转 null，否则撞 NOT NULL）；其余空值统一落 null
      params.push(k === "members" ? JSON.stringify(v) : ((k === "archived" || k === "pinned") ? v : (v || null)));
    }
    if (parts.length === 0) return getProjectFull(id);
    params.push(id);
    db.prepare(`UPDATE projects SET ${parts.join(", ")} WHERE id = ?`).run(...params);
    // 审计：对比 cur 与最终值，只记实际变更字段（V2.1 审计追踪）
    const diff = {};
    for (const k of Object.keys(finalValues)) {
      const oldV = k === "name" ? cur.name
        : k === "description" ? cur.description
        : k === "members" ? cur.members
        : k === "planStart" ? (cur.planStart || "")
        : k === "planEnd" ? (cur.planEnd || "")
        : k === "status" ? cur.status
        : k === "projectSetId" ? (cur.projectSetId || "")
        : k === "archived" ? !!cur.archived
        : !!cur.pinned; // pinned
      const rawNew = finalValues[k];
      // 变更判定用原文；description 富文本入审计前文本化截断，防审计表膨胀
      if (JSON.stringify(oldV) !== JSON.stringify(rawNew)) {
        diff[k] = {
          old: k === "description" ? auditText(oldV) : oldV,
          new: k === "description" ? auditText(rawNew) : rawNew,
        };
      }
    }
    if (Object.keys(diff).length > 0) {
      const oldFrag = {};
      const newFrag = {};
      for (const [k, v] of Object.entries(diff)) {
        oldFrag[k] = v.old;
        newFrag[k] = v.new;
      }
      // 归档/取消归档特判：archived 变化时动作名区分（其余统一「更新项目」）
      let action = "更新项目";
      if (diff.archived) action = diff.archived.new ? "归档项目" : "恢复归档";
      logAudit(id, action, "project", id, JSON.stringify(oldFrag), JSON.stringify(newFrag));
    }
    return getProjectFull(id);
  }

  function deleteProject(id) {
    // 检查：递归所有任务（含后代），任意已完成则拒绝
    const allTasks = getProjectTasks(id);
    const doneCount = allTasks.filter((t) => t.done).length;
    if (doneCount > 0) {
      throw new Error(`项目下还有 ${doneCount} 个已完成任务，无法删除`);
    }
    // 审计：删除动作先落库，随后项目删除 → FK 级联清空该项目全部审计（含本条，验收要求级联）
    const row = db.prepare("SELECT name FROM projects WHERE id = ?").get(id);
    logAudit(id, "删除项目", "project", id, null, JSON.stringify({ name: row?.name || id }));
    // 转化自该项目的临时任务回退为已完成（转化标记失效：项目已删）
    const affectedQuick = db.prepare("SELECT * FROM quick_tasks WHERE converted_project_id = ?").all(id);
    db.transaction(() => {
      db.prepare(
        "UPDATE quick_tasks SET status = 'done', converted_task_id = NULL, converted_project = NULL, converted_project_id = NULL WHERE converted_project_id = ?"
      ).run(id);
      db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    })();
    for (const qrow of affectedQuick) syncQuickTaskFts({ ...qrow, status: "done" });
    return true;
  }

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

  // ===== 项目总结持久化（V2.0 S8） =====

  // 总结 content 上限（字节）：超大 JSON 撑爆存储 + 前端解析卡顿（P2-3，与 digest 的 500 字截断策略对齐）
  const SUMMARY_CONTENT_MAX_BYTES = 50 * 1024;

  /**
   * 保存项目总结到 project_summaries（content 为总结模板 JSON 字符串，原样存储）
   * @param {string} projectId
   * @param {string} content 总结 JSON 字符串（模板见需求 1.1）
   * @param {string} [source] manual=手动 / auto=Agent 调用（默认 manual）
   * @returns {{id:string, projectId:string, content:string, createdAt:string, source:string}}
   */
  function saveProjectSummary(projectId, content, source = "manual") {
    if (!["manual", "auto"].includes(source)) throw new Error("source 不合法（仅支持 manual / auto）");
    if (!content || typeof content !== "string" || !content.trim()) throw new Error("总结内容不能为空");
    if (Buffer.byteLength(content, "utf8") > SUMMARY_CONTENT_MAX_BYTES) {
      throw new Error(`总结内容过长（上限 ${SUMMARY_CONTENT_MAX_BYTES / 1024}KB）`);
    }
    const proj = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    const summary = {
      id: shortId(),
      projectId,
      content,
      createdAt: new Date().toISOString(),
      source,
    };
    db.prepare(`
      INSERT INTO project_summaries (id, project_id, content, created_at, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(summary.id, summary.projectId, summary.content, summary.createdAt, summary.source);
    return summary;
  }

  /**
   * 取项目最近 N 条总结（created_at 倒序，最新在前）
   * @param {string} projectId
   * @param {number} [limit] 条数上限（默认 10，最大 50）
   * @returns {Array<{id:string, projectId:string, content:string, createdAt:string, source:string}>}
   */
  function getProjectSummaries(projectId, limit = 10) {
    const proj = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("limit 必须是正整数");
    const capped = Math.min(limit, 50);
    const rows = db.prepare(`
      SELECT id, project_id, content, created_at, source
      FROM project_summaries
      WHERE project_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(projectId, capped);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      content: r.content,
      createdAt: r.created_at,
      source: r.source,
    }));
  }

  // ===== Tasks =====

  function getTaskOrThrow(projectId, taskId) {
    const t = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId);
    if (!t) throw new Error(`任务 ${taskId} 不存在`);
    return t;
  }

  function taskRowToObject(row) {
    return {
      id: row.id,
      project_id: row.project_id,
      parent_task_id: row.parent_task_id,
      index_num: row.index_num,
      name: row.name,
      description: row.description,
      done: !!row.done,
      doneAt: row.done_at || "",
      assignees: parseAssignees(row.assignees),
      startDate: row.start_date || "",
      endDate: row.end_date || "",
      priority: row.priority || "P3",
      isMilestone: !!row.is_milestone,
      created_at: row.created_at,
    };
  }

  /**
   * 日期规范化：空值 → null；非空必须符合 YYYY-MM-DD 且为真实存在的日期
   * 用 Date.UTC 构造 + 反向比对，拦截 2026-02-30 这类溢出日期（P2-1）
   * @param {*} value
   * @returns {string|null}
   */
  function normalizeDate(value) {
    if (value === undefined || value === null || value === "") return null;
    const s = String(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) {
      throw new Error(`日期格式必须为 YYYY-MM-DD，收到「${value}」`);
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      throw new Error(`日期不合法：${value}`);
    }
    return s;
  }

  /**
   * 校验任务起止日期（createTask / updateTask 共用）
   * - endDate >= startDate（两端都填时）→ 不满足抛错（硬阻断）
   * - 落在项目 planStart / planEnd 范围内 → 越界仅软提示（warnings），不阻断
   * @param {{startDate: string|null, endDate: string|null, planStart: string|null, planEnd: string|null}} input
   * @returns {string[]} 越界软提示列表（无则空数组）
   */
  function validateTaskDates({ startDate, endDate, planStart, planEnd }) {
    if (startDate && endDate && endDate < startDate) {
      throw new Error("任务结束日期不能早于开始日期");
    }
    const warnings = [];
    // 四象限越界提示（P2-8：补全 startDate>planEnd / endDate<planStart 两种组合）
    if (startDate && planStart && startDate < planStart) {
      warnings.push(`任务开始日期 ${startDate} 早于项目计划开始日期 ${planStart}`);
    }
    if (startDate && planEnd && startDate > planEnd) {
      warnings.push(`任务开始日期 ${startDate} 晚于项目计划结束日期 ${planEnd}`);
    }
    if (endDate && planStart && endDate < planStart) {
      warnings.push(`任务结束日期 ${endDate} 早于项目计划开始日期 ${planStart}`);
    }
    if (endDate && planEnd && endDate > planEnd) {
      warnings.push(`任务结束日期 ${endDate} 晚于项目计划结束日期 ${planEnd}`);
    }
    return warnings;
  }

  /**
   * 校验任务优先级：P0~P5 之一（createTask / updateTask 共用），空值默认 P3
   */
  function normalizePriority(value) {
    if (value === undefined || value === null || value === "") return "P3";
    const p = String(value).trim();
    if (!PRIORITY_LEVELS.includes(p)) {
      throw new Error(`优先级必须为 P0~P5 之一，收到「${value}」`);
    }
    return p;
  }

  /**
   * 校验任务里程碑布尔标记（createTask / updateTask 共用），空值默认 false
   * 严格布尔语义：boolean / 0 / 1 归一化，其他类型视为脏数据抛错
   * @param {*} value
   * @returns {boolean}
   */
  function normalizeMilestone(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === "boolean") return value;
    if (value === 0 || value === 1) return !!value;
    throw new Error(`里程碑标记必须是布尔值，收到「${value}」`);
  }

  /**
   * 校验任务名称：必填 + 1-50 字符（与前端 rules 对齐，P1-5）
   */
  function validateTaskName(name) {
    if (name === undefined || name === null || !String(name).trim()) {
      throw new Error("任务名称不能为空");
    }
    const trimmed = String(name).trim();
    if (trimmed.length > 50) throw new Error("任务名称最多50个字符");
    return trimmed;
  }

  /**
   * 校验 assignees 属于项目 members（数组版：每个元素强校验，防脏数据）
   * @param {*} assignees
   * @param {string[]} members
   * @returns {string[]} 归一化后的数组（去空、去重）
   */
  function validateAssignees(assignees, members) {
    const list = Array.isArray(assignees) ? assignees : [];
    const cleaned = [...new Set(list.map((a) => String(a).trim()).filter(Boolean))];
    for (const a of cleaned) {
      if (!members.includes(a)) {
        throw new Error(`成员「${a}」不在项目成员列表中`);
      }
    }
    return cleaned;
  }

  /**
   * 列出项目下的任务（扁平，可按状态 / 负责人 / 关键字筛选）
   * @param {string} projectId
   * @param {{status?: 'done'|'undone'|'all', assignee?: string, keyword?: string}} filters
   *   status：done=已完成 / undone=未完成 / all=全部（默认 all）
   *   assignee：成员名，空字符串 = 全部；匹配 projects.members JSON 数组
   *   keyword：按任务名 / 描述 / 批注内容模糊匹配（可选）；命中批注时用 LEFT JOIN + DISTINCT 去重
   */
  /**
   * 按任务 ID 全局查询（跨项目），返回任务详情 + 所属项目名 + 父任务名 + 批注
   * @param {string} taskId
   * @returns {object|null} 未找到返回 null
   */
  function getTaskById(taskId) {
    const t = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!t) return null;
    const task = taskRowToObject(t);
    // 所属项目
    const proj = db.prepare("SELECT id, name FROM projects WHERE id = ?").get(t.project_id);
    task.project = proj ? { id: proj.id, name: proj.name } : null;
    // 父任务名
    if (t.parent_task_id) {
      const parent = db.prepare("SELECT name FROM tasks WHERE id = ?").get(t.parent_task_id);
      task.parentTask = parent ? { id: t.parent_task_id, name: parent.name } : null;
    }
    // 批注
    task.annotations = getTaskAnnotations(taskId);
    // 子任务（直接子级，扁平带 name）
    task.subtasks = db.prepare("SELECT id, name, done FROM tasks WHERE parent_task_id = ? ORDER BY index_num").all(taskId)
      .map((s) => ({ id: s.id, name: s.name, done: !!s.done }));
    // V2.2 R14：任务反向展示关联方案（含方案标题）
    task.planRefs = db.prepare(`
      SELECT p.id, p.title, p.status
      FROM task_plans tp JOIN plans p ON p.id = tp.plan_id
      WHERE tp.task_id = ? ORDER BY p.created_at ASC
    `).all(taskId);
    // V2.2 R11 一致性：任务关联文件（含名称/类型，供工具输出；文件已删时该引用随 join 消失）
    task.fileRefs = db.prepare(`
      SELECT f.id, f.name, f.ext
      FROM task_file_refs tfr JOIN files f ON f.id = tfr.file_id
      WHERE tfr.task_id = ? ORDER BY f.uploaded_at DESC
    `).all(taskId);
    return task;
  }

  function listTasks(projectId, filters = {}) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const status = filters.status || "all";
    const assignee = (filters.assignee || "").trim();
    const keyword = (filters.keyword || "").trim();
    const dateRange = filters.dateRange || "";
    const nearDaysRaw = filters.nearDeadlineDays;
    const nearDays = Number.isFinite(Number(nearDaysRaw)) ? Math.max(0, Math.floor(Number(nearDaysRaw))) : null;
    const where = ["t.project_id = ?"];
    const params = [projectId];
    if (status === "done") {
      where.push("t.done = 1");
    } else if (status === "undone") {
      where.push("t.done = 0");
    }
    // dateRange='withDates'：仅返回有开始/结束日期的任务（日历数据源）
    if (dateRange === "withDates") {
      where.push("(t.start_date IS NOT NULL OR t.end_date IS NOT NULL)");
    }
    // nearDeadlineDays=N：未完成且 endDate 在 [今天, 今天+N] 天内到期（快捷查询）
    if (nearDays !== null) {
      const today = localToday();
      const end = addDays(today, nearDays);
      where.push("t.done = 0 AND t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?");
      params.push(today, end);
    }
    // assignee 精确匹配任务 assignees 数组元素（json_each），空 assignee 时不做 join
    // 脏数据（非 JSON）用 json_valid 兑底为 []，避免 json_each 抛 malformed JSON
    const joinJe = assignee ? ", json_each(CASE WHEN json_valid(t.assignees) THEN t.assignees ELSE '[]' END) je" : "";
    if (assignee) {
      where.push("je.value = ?");
      params.push(assignee);
    }
    // keyword 命中任务名 / 描述 / 批注内容（LEFT JOIN annotations + DISTINCT 去重）
    const joinAn = keyword ? "LEFT JOIN annotations a ON a.task_id = t.id" : "";
    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push(
        "(t.name LIKE ? ESCAPE '\\' OR COALESCE(t.description, '') LIKE ? ESCAPE '\\' OR a.content LIKE ? ESCAPE '\\')"
      );
      params.push(like, like, like);
    }
    const distinct = keyword ? "DISTINCT " : "";
    const rows = db.prepare(`
      SELECT ${distinct}t.id, t.project_id, t.parent_task_id, t.index_num, t.name, t.description, t.done, t.done_at, t.assignees, t.start_date, t.end_date, t.priority, t.is_milestone, t.created_at
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      ${joinAn}
      ${joinJe}
      WHERE ${where.join(" AND ")}
      ORDER BY
        COALESCE((SELECT index_num FROM tasks tp WHERE tp.id = t.parent_task_id), t.index_num),
        CASE WHEN t.parent_task_id IS NULL THEN 0 ELSE 1 END,
        t.index_num,
        t.created_at
    `).all(...params);
    // 等级排序（P0 最前 → P5 最后）→ 同等级按开始时间（无开始时间排最后）→ 再按创建时间
    // JS 排序在返回前做：与拖拽维护的 index_num 顺序解耦，reorderTasks 不受影响
    const planRefsMap = getTaskPlanRefsMap(projectId);
    return rows.map((r) => ({ ...taskRowToObject(r), planRefs: planRefsMap.get(r.id) || [] })).sort((a, b) => {
      const pa = a.priority || "P3";
      const pb = b.priority || "P3";
      if (pa !== pb) return pa < pb ? -1 : 1; // P0 < P1 < ... < P5（字符串序即等级序）
      const sa = a.startDate || "";
      const sb = b.startDate || "";
      if (sa !== sb) {
        if (!sa) return 1; // 无开始时间排最后
        if (!sb) return -1;
        return sa < sb ? -1 : 1; // YYYY-MM-DD 字符串比较即时间序
      }
      const ca = a.created_at || "";
      const cb = b.created_at || "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return 0;
    });
  }

  /**
   * 构造任务对象（校验 + 组装，不含 INSERT / 事务 / 审计）
   * createTask 与 convertPlanToTask 共用，保证任务创建的校验与字段逻辑一致
   * @param {string} projectId
   * @param {object} data 与 createTask 的 data 同构
   * @returns {{ task: object, planIds: string[], warnings: string[] }}
   */
  function buildTaskObject(projectId, data) {
    // 验证项目存在，并取 plan / members 供日期与成员校验
    const proj = db.prepare("SELECT plan_start, plan_end, members FROM projects WHERE id = ?").get(projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    const projectMembers = JSON.parse(proj.members || "[]");

    // 验证父任务（如果有）
    let parentTask = null;
    if (data.parentTaskId) {
      parentTask = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(data.parentTaskId, projectId);
      if (!parentTask) throw new Error(`父任务 ${data.parentTaskId} 不存在`);
    }

    // 新字段：成员数组（强校验每个元素在 members）+ 起止日期（end>=start 硬校验，越界软提示）
    const assignees = validateAssignees(data.assignees, projectMembers);
    const startDate = normalizeDate(data.startDate);
    const endDate = normalizeDate(data.endDate);
    const warnings = validateTaskDates({
      startDate, endDate,
      planStart: proj.plan_start || null,
      planEnd: proj.plan_end || null,
    });

    // 计算 index_num：兄弟节点末尾 +1
    const siblingMax = db.prepare(
      data.parentTaskId
        ? "SELECT COALESCE(MAX(index_num), -1) as m FROM tasks WHERE parent_task_id = ?"
        : "SELECT COALESCE(MAX(index_num), -1) as m FROM tasks WHERE project_id = ? AND parent_task_id IS NULL"
    ).get(...(data.parentTaskId ? [data.parentTaskId] : [projectId]));

    // V2.2 R14：关联方案（白名单校验：必须属于本项目，防跨项目/脏数据；任务只能关联已采纳的方案）
    const planIds = Array.isArray(data.planIds) ? [...new Set(data.planIds)] : [];
    for (const pid of planIds) {
      const plan = db.prepare("SELECT id, title, status FROM plans WHERE id = ? AND project_id = ?").get(pid, projectId);
      if (!plan) throw new Error(`方案 ${pid} 不存在`);
      if (plan.status !== "已采纳") throw new Error(`方案「${plan.title}」状态为「${plan.status}」，任务只能关联已采纳的方案`);
    }

    const task = {
      id: shortId(),
      project_id: projectId,
      parent_task_id: data.parentTaskId || null,
      index_num: siblingMax.m + 1,
      name: validateTaskName(data.name),
      description: sanitizeHtml(data.description),
      done: 0,
      assignees: assignees.length ? JSON.stringify(assignees) : null,
      start_date: startDate,
      end_date: endDate,
      priority: normalizePriority(data.priority),
      is_milestone: normalizeMilestone(data.isMilestone) ? 1 : 0,
      created_at: new Date().toISOString(),
    };
    return { task, planIds, warnings };
  }

  /**
   * 写入任务行 + 文件引用 + 方案关联（不含事务，由调用方包事务保证原子）
   * @param {object} task buildTaskObject 产出的任务对象
   * @param {string[]} fileRefs
   * @param {string[]} planIds
   */
  function insertTaskWithRefs(task, fileRefs, planIds) {
    db.prepare(`
      INSERT INTO tasks (id, project_id, parent_task_id, index_num, name, description, done, assignees, start_date, end_date, priority, is_milestone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.project_id, task.parent_task_id, task.index_num, task.name, task.description, task.assignees, task.start_date, task.end_date, task.priority, task.is_milestone, task.created_at);
    const insFileRef = db.prepare("INSERT OR IGNORE INTO task_file_refs (task_id, file_id) VALUES (?, ?)");
    for (const fid of fileRefs) {
      insFileRef.run(task.id, fid);
    }
    const insTaskPlan = db.prepare("INSERT OR IGNORE INTO task_plans (task_id, plan_id) VALUES (?, ?)");
    for (const pid of planIds) {
      insTaskPlan.run(task.id, pid);
    }
  }

  function createTask(projectId, data) {
    const { task, planIds, warnings } = buildTaskObject(projectId, data);
    db.transaction(() => insertTaskWithRefs(task, data.fileRefs || [], planIds))();

    logAudit(projectId, "创建任务", "task", task.id, null, JSON.stringify({
      name: task.name,
      done: false,
      assignees: parseAssignees(task.assignees),
      startDate: task.start_date || "",
      endDate: task.end_date || "",
      priority: task.priority,
      isMilestone: !!task.is_milestone,
      parentTaskId: task.parent_task_id || null,
    }));

    const result = taskRowToObject(task);
    if (warnings.length) result.warnings = warnings;
    return result;
  }

  function updateTask(projectId, taskId, data) {
    const cur = getTaskOrThrow(projectId, taskId);
    const sets = [];
    const params = [];
    const warnings = [];
    if (data.name !== undefined) {
      sets.push("name = ?");
      params.push(validateTaskName(data.name));
    }
    if (data.description !== undefined) {
      sets.push("description = ?");
      params.push(sanitizeHtml(data.description));
    }
    if (data.done !== undefined) {
      // V2.1 规则：任务完成前置校验，该任务下所有便利贴必须已确认（含子任务规则先放行）
      if (data.done && !cur.done) {
        const pending = db.prepare("SELECT COUNT(*) AS c FROM annotations WHERE task_id = ? AND confirmed = 0").get(taskId).c;
        if (pending > 0) throw new Error(`任务还有 ${pending} 个便利贴未确认，请先确认后再完成任务`);
        // V2.2 R7：完成任务时校验后代无未完成，防「父完成 + 子未完成」矛盾树（与便利贴校验并列）
        const pendingDesc = countIncompleteDescendants(taskId, projectId);
        if (pendingDesc > 0) throw new Error(`任务还有 ${pendingDesc} 个子任务未完成，请先完成子任务`);
      }
      // v1.3.1：父任务仍为完成时不能激活子任务（未完成状态只能从父任务向下同步）
      if (!data.done && cur.parent_task_id) {
        const parent = db.prepare("SELECT id, name, done FROM tasks WHERE id = ? AND project_id = ?").get(cur.parent_task_id, projectId);
        if (parent && parent.done) {
          throw new Error(`无法激活子任务：父任务「${parent.name}」尚未激活，请先激活父任务`);
        }
      }
      // done 状态无实际变化时不重复写（V2.2 R3 幂等）：避免已完成任务再传 done=true 刷新 done_at
      if (!!data.done !== !!cur.done) {
        sets.push("done = ?"); params.push(data.done ? 1 : 0);
        // done 状态实际变化时才写/清 done_at（本地时间，无回填）
        sets.push("done_at = ?"); params.push(data.done ? localNowIso() : null);
      }
    }
    // parentTaskId：校验 + 移动后重排（P2：新父级追加末尾、旧父级压缩序号）
    let moveToParent = null;
    let doParentMove = false;
    if (data.parentTaskId !== undefined) {
      const newParent = data.parentTaskId;
      const nextParent = newParent || null;
      doParentMove = nextParent !== (cur.parent_task_id || null);
      if (newParent !== null && newParent !== undefined) {
        // 三重校验：自指 / 同项目归属 / 成环（P1-1）
        if (newParent === taskId) throw new Error("不能将任务移动到自身下面");
        const p = db.prepare("SELECT id FROM tasks WHERE id = ? AND project_id = ?").get(newParent, projectId);
        if (!p) throw new Error(`父任务 ${newParent} 不存在或不属于该项目`);
        if (wouldCreateCycle(projectId, taskId, newParent)) throw new Error("不能移动到自己的子任务下面");
      }
      if (doParentMove) moveToParent = nextParent;
    }
    // 成员：数组校验（每个元素属于项目 members，与 createTask 一致）
    if (data.assignees !== undefined) {
      const proj = db.prepare("SELECT members FROM projects WHERE id = ?").get(projectId);
      const cleaned = validateAssignees(data.assignees, JSON.parse(proj?.members || "[]"));
      const next = JSON.stringify(cleaned);
      if (next !== (cur.assignees || "")) { sets.push("assignees = ?"); params.push(cleaned.length ? next : null); }
    }
    // 起止日期：部分更新时用当前值参与校验（end>=start 硬校验，越界软提示）
    if (data.startDate !== undefined || data.endDate !== undefined) {
      const nextStart = data.startDate !== undefined ? normalizeDate(data.startDate) : (cur.start_date || null);
      const nextEnd = data.endDate !== undefined ? normalizeDate(data.endDate) : (cur.end_date || null);
      const proj = db.prepare("SELECT plan_start, plan_end FROM projects WHERE id = ?").get(projectId);
      warnings.push(...validateTaskDates({
        startDate: nextStart, endDate: nextEnd,
        planStart: proj?.plan_start || null,
        planEnd: proj?.plan_end || null,
      }));
      if (nextStart !== (cur.start_date || null)) { sets.push("start_date = ?"); params.push(nextStart); }
      if (nextEnd !== (cur.end_date || null)) { sets.push("end_date = ?"); params.push(nextEnd); }
    }
    // 优先级：P0~P5 校验，非法抛错
    if (data.priority !== undefined) {
      const next = normalizePriority(data.priority);
      if (next !== (cur.priority || "P3")) { sets.push("priority = ?"); params.push(next); }
    }
    // 里程碑标记：布尔校验（true/false、0/1 归一化，非法抛错）
    if (data.isMilestone !== undefined) {
      const next = normalizeMilestone(data.isMilestone) ? 1 : 0;
      if (next !== (cur.is_milestone || 0)) { sets.push("is_milestone = ?"); params.push(next); }
    }
    if (data.fileRefs !== undefined) {
      // 替换文件引用集
      const updateFileRefs = db.transaction(() => {
        db.prepare("DELETE FROM task_file_refs WHERE task_id = ?").run(taskId);
        const ins = db.prepare("INSERT OR IGNORE INTO task_file_refs (task_id, file_id) VALUES (?, ?)");
        for (const fid of data.fileRefs) ins.run(taskId, fid);
      });
      updateFileRefs();
    }
    // V2.2 R14：关联方案全量替换（白名单校验：必须属于本项目；任务只能关联已采纳的方案）
    if (data.planIds !== undefined) {
      const ids = Array.isArray(data.planIds) ? [...new Set(data.planIds)] : [];
      for (const pid of ids) {
        const plan = db.prepare("SELECT id, title, status FROM plans WHERE id = ? AND project_id = ?").get(pid, projectId);
        if (!plan) throw new Error(`方案 ${pid} 不存在`);
        if (plan.status !== "已采纳") throw new Error(`方案「${plan.title}」状态为「${plan.status}」，任务只能关联已采纳的方案`);
      }
      const updateTaskPlans = db.transaction(() => {
        db.prepare("DELETE FROM task_plans WHERE task_id = ?").run(taskId);
        const ins = db.prepare("INSERT OR IGNORE INTO task_plans (task_id, plan_id) VALUES (?, ?)");
        for (const pid of ids) ins.run(taskId, pid);
      });
      updateTaskPlans();
    }
    if (sets.length) {
      params.push(taskId);
      db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    }
    // 移动父级：事务内更新父级 + 重排新旧两个兄弟组（P2：避免重复/空洞 index_num）
    if (doParentMove) {
      const updIndex = db.prepare("UPDATE tasks SET index_num = ? WHERE id = ?");
      db.transaction(() => {
        db.prepare("UPDATE tasks SET parent_task_id = ? WHERE id = ?").run(moveToParent, taskId);
        // 旧父级兄弟压缩（排除自身，序号连续无空洞）
        const oldRows = db.prepare(
          "SELECT id FROM tasks WHERE project_id = ? AND parent_task_id IS ? AND id != ? ORDER BY index_num"
        ).all(projectId, cur.parent_task_id || null, taskId);
        oldRows.forEach((r, i) => updIndex.run(i, r.id));
        // 新父级：其余兄弟保持原序，自身追加末尾
        const newRows = db.prepare(
          "SELECT id FROM tasks WHERE project_id = ? AND parent_task_id IS ? AND id != ? ORDER BY index_num"
        ).all(projectId, moveToParent, taskId);
        newRows.forEach((r, i) => updIndex.run(i, r.id));
        updIndex.run(newRows.length, taskId);
      })();
    }
    const after = getTaskOrThrow(projectId, taskId);
    const result = taskRowToObject(after);
    if (warnings.length) result.warnings = warnings;
    // 审计：对比 cur 与最终行，只记实际变更字段（V2.1 审计追踪）
    const diff = {};
    for (const k of ["name", "description", "done", "assignees", "start_date", "end_date", "priority", "is_milestone", "parent_task_id"]) {
      const ov = cur[k];
      const nv = after[k];
      if (JSON.stringify(ov) !== JSON.stringify(nv)) {
        diff[k] = {
          old: k === "description" ? auditText(ov) : ov,
          new: k === "description" ? auditText(nv) : nv,
        };
      }
    }
    if (Object.keys(diff).length > 0) {
      const oldFrag = {};
      const newFrag = {};
      for (const [k, v] of Object.entries(diff)) {
        // 展示归一化：done/is_milestone → bool，assignees → 数组（JSON 片段可读）
        oldFrag[k] = k === "done" || k === "is_milestone" ? !!v.old : (k === "assignees" ? parseAssignees(v.old) : v.old);
        newFrag[k] = k === "done" || k === "is_milestone" ? !!v.new : (k === "assignees" ? parseAssignees(v.new) : v.new);
      }
      logAudit(projectId, "更新任务", "task", taskId, JSON.stringify(oldFrag), JSON.stringify(newFrag));
    }
    return result;
  }

  /**
   * 批量创建任务（事务包裹，P2-3：任一条校验失败整体回滚，不产生部分落库）
   * 复用 createTask 全部校验（名称/成员/日期/父任务），事务内任一失败即回滚
   * @param {string} projectId
   * @param {Array} items 与 createTask 的 data 同构，最多 50 条
   * @returns {Array} 创建后的任务对象列表
   */
  function createTasks(projectId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("tasks 不能为空");
    if (items.length > 50) throw new Error("单次最多创建 50 个任务");
    // 名称整体预校验（提前失败，避免事务内第一条就因名称问题抛错）
    for (const [i, it] of items.entries()) {
      if (!it || !String(it.name || "").trim()) throw new Error(`第 ${i + 1} 个任务缺少名称`);
    }
    // 事务包裹：任一条失败整体回滚；错误信息带序号定位（P3-2）
    return db.transaction(() =>
      items.map((it, i) => {
        try {
          return createTask(projectId, it);
        } catch (e) {
          throw new Error(`第 ${i + 1} 个任务：${e.message}`);
        }
      })
    )();
  }

  /**
   * 批量更新任务（V2.2 R7，逐条独立语义）
   * - 每条走 updateTask 完整校验（名称/成员/日期/成环/便利贴前置）
   * - 单条失败不影响其他条（PM 拍板：不做整体回滚），返回成功/失败清单及原因
   * @param {string} projectId
   * @param {Array<{id: string, name?, description?, assignees?, startDate?, endDate?, priority?, done?}>} items 最多 50 条
   * @returns {{success: Array<{id:string,name:string}>, failed: Array<{id:string|null,index:number,error:string}>}}
   */
  function updateTasks(projectId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("tasks 不能为空");
    if (items.length > 50) throw new Error("单次最多更新 50 个任务");
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const success = [];
    const failed = [];
    items.forEach((it, i) => {
      const index = i + 1;
      if (!it || !it.id) {
        failed.push({ id: it?.id || null, index, error: "缺少任务 ID" });
        return;
      }
      try {
        const updated = updateTask(projectId, it.id, it);
        success.push({ id: it.id, name: updated.name });
      } catch (e) {
        failed.push({ id: it.id, index, error: e.message });
      }
    });
    return { success, failed };
  }

  function deleteTask(projectId, taskId) {
    const t = getTaskOrThrow(projectId, taskId); // 验证存在 + 取名称供审计
    // V2.2 R11：收集本任务及全部后代，先清 plans.task_id 悬空引用（plans 无外键级联，须应用层清理）
    const allTasks = getProjectTasks(projectId);
    const affectedIds = collectDescendantIds(taskId, allTasks);
    const clearPlanTask = db.prepare("UPDATE plans SET task_id = NULL WHERE task_id = ?");
    const clearTaskPlan = db.prepare("DELETE FROM task_plans WHERE task_id = ?");
    // 转化来源的临时任务回退为已完成（转化标记失效：正式任务已删）
    const revertQuick = db.prepare(
      "UPDATE quick_tasks SET status = 'done', converted_task_id = NULL, converted_project = NULL, converted_project_id = NULL WHERE converted_task_id = ?"
    );
    const listQuickByTask = db.prepare("SELECT * FROM quick_tasks WHERE converted_task_id = ?");
    db.transaction(() => {
      for (const tid of affectedIds) {
        clearPlanTask.run(tid);
        clearTaskPlan.run(tid); // task_plans 虽声明 FK 级联，此处双保险显式清理（无残留）
        const affectedQuick = listQuickByTask.all(tid);
        if (affectedQuick.length) {
          revertQuick.run(tid);
          for (const row of affectedQuick) syncQuickTaskFts({ ...row, status: "done" });
        }
      }
      // CASCADE 自动删后代
      db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    })();
    logAudit(projectId, "删除任务", "task", taskId, JSON.stringify({ name: t.name }), null);
    return true;
  }

  function reorderTasks(projectId, taskIds) {
    if (!Array.isArray(taskIds)) throw new Error("taskIds 必须是数组");
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const update = db.prepare("UPDATE tasks SET index_num = ? WHERE id = ? AND project_id = ?");
    db.transaction(() => {
      taskIds.forEach((id, i) => update.run(i, id, projectId));
    })();
    // V2.3.1 补审：批量重排，targetId 置空，newValue 记录完整顺序
    logAudit(projectId, "排序任务", "task", null, null, JSON.stringify({ ids: taskIds }));
    return getProjectFull(projectId)?.tasks || [];
  }

  /**
   * 重排某父任务下的子任务
   */
  function reorderSubtasks(projectId, parentTaskId, subtaskIds) {
    if (!Array.isArray(subtaskIds)) throw new Error("subtaskIds 必须是数组");
    getTaskOrThrow(projectId, parentTaskId);
    const update = db.prepare("UPDATE tasks SET index_num = ? WHERE id = ? AND parent_task_id = ?");
    db.transaction(() => {
      subtaskIds.forEach((id, i) => update.run(i, id, parentTaskId));
    })();
    logAudit(projectId, "排序任务", "task", null, null, JSON.stringify({ parentTaskId, ids: subtaskIds }));
    return getProjectFull(projectId)?.tasks || [];
  }

  // ===== Files =====

  // 摘要上限（字）：超出截断，避免登记冗余（V2.0 文件资产化）
  const DIGEST_MAX_LEN = 500;

  /**
   * 文件行 → 对外对象（snake_case 排除，统一 camelCase）
   * folderId：所属文件夹（NULL=根目录）；pathExists：登记路径当前是否真实存在（路径失效 UI 提示用）
   */
  function fileRowToObject(f) {
    return {
      id: f.id,
      name: f.name,
      path: f.path,
      size: f.size ?? null,
      ext: f.ext ?? null,
      indexed: f.indexed ?? 0,
      digest: f.digest ?? null,
      uploadedAt: f.uploaded_at,
      folderId: f.folder_id || null,
      pathExists: !!(f.path && fs.existsSync(f.path)),
    };
  }

  /**
   * 读取文件元信息（size/ext），路径失效或非文件时兜底 null，不抛错（V2.0 文件资产化）
   * @param {string} filePath
   * @returns {{size: number|null, ext: string|null}} size=字节数，ext=小写扩展名（无扩展名→null）
   */
  function readFileMeta(filePath) {
    try {
      const st = fs.statSync(filePath);
      if (!st.isFile()) return { size: null, ext: null };
      const ext = path.extname(filePath).slice(1).toLowerCase();
      return { size: st.size, ext: ext || null };
    } catch {
      return { size: null, ext: null };
    }
  }

  /**
   * 归一化 digest：空值兜底 null，超长截断到 DIGEST_MAX_LEN（V2.0 文件资产化）
   * @param {*} digest 正文摘要（内容解析归平台，登记时仅透传）
   * @returns {string|null}
   */
  function normalizeDigest(digest) {
    if (digest === undefined || digest === null) return null;
    const s = String(digest).trim();
    if (!s) return null;
    return s.length > DIGEST_MAX_LEN ? s.slice(0, DIGEST_MAX_LEN) : s;
  }

  /**
   * 登记项目文件（V2.0：登记时自动读 size/ext，digest 可选透传，indexed 默认 0）
   * @param {string} projectId
   * @param {string} filePath 文件路径（可能失效，失效时 size/ext 为 null）
   * @param {string|undefined} digest 正文摘要（限 500 字，不传则 null）
   * @param {string|null|undefined} folderId 所属文件夹（NULL/不传=根目录，V2.1.4 文件系统重构）
   */
  function addFile(projectId, filePath, digest, folderId) {
    if (!filePath || typeof filePath !== "string") throw new Error("缺少文件路径");
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const targetFolder = folderId || null;
    if (targetFolder) {
      const folder = db.prepare("SELECT 1 FROM file_folders WHERE id = ? AND project_id = ?").get(targetFolder, projectId);
      if (!folder) throw new Error(`文件夹 ${targetFolder} 不存在或不属于该项目`);
    }
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const meta = readFileMeta(filePath);
    const file = {
      id: shortId(),
      project_id: projectId,
      name,
      path: filePath,
      size: meta.size,
      ext: meta.ext,
      indexed: 0,
      digest: normalizeDigest(digest),
      uploaded_at: new Date().toISOString().slice(0, 10),
      folder_id: targetFolder,
    };
    db.prepare(
      "INSERT INTO files (id, project_id, name, path, size, ext, indexed, digest, uploaded_at, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(file.id, file.project_id, file.name, file.path, file.size, file.ext, file.indexed, file.digest, file.uploaded_at, file.folder_id);
    logAudit(projectId, "登记文件", "file", file.id, null, JSON.stringify({
      name: file.name,
      size: file.size ?? null,
      ext: file.ext ?? null,
      folderId: file.folder_id || null,
    }));
    return fileRowToObject(file);
  }

  /**
   * 取单个文件（已登记校验 + 完整字段），不存在返回 null
   */
  function getFile(projectId, fileId) {
    const row = db.prepare(
      "SELECT id, name, path, size, ext, indexed, digest, uploaded_at, folder_id FROM files WHERE id = ? AND project_id = ?"
    ).get(fileId, projectId);
    return row ? fileRowToObject(row) : null;
  }

  /**
   * 列出项目文件（可按文件夹/名称过滤）
   * @param {string} projectId
   * @param {object} [opts]
   * @param {string|null|undefined} [opts.folderId] 不传=全部；null=根目录（folder_id IS NULL）；具体 id=该文件夹下的文件（不含子夹）
   * @param {string} [opts.name] 按文件名模糊搜索（LIKE 转义）
   */
  function listFiles(projectId, opts = {}) {
    const where = ["project_id = ?"];
    const params = [projectId];
    if (opts.folderId !== undefined) {
      // IS ? 对 NULL 参数匹配 folder_id IS NULL，对非 NULL 等价于 =（比 = 更安全）
      where.push("folder_id IS ?");
      params.push(opts.folderId === null ? null : opts.folderId);
    }
    if (opts.name) {
      where.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(opts.name)}%`);
    }
    return db.prepare(`
      SELECT id, name, path, size, ext, indexed, digest, uploaded_at, folder_id FROM files
      WHERE ${where.join(" AND ")}
      ORDER BY uploaded_at DESC, id
    `).all(...params).map(fileRowToObject);
  }

  /**
   * 移动文件到文件夹（folderId NULL=根目录，V2.1.4 文件系统重构）
   */
  function moveFile(projectId, fileId, folderId) {
    const file = db.prepare("SELECT id, name, folder_id FROM files WHERE id = ? AND project_id = ?").get(fileId, projectId);
    if (!file) throw new Error(`文件 ${fileId} 不存在`);
    const target = folderId || null;
    if (target) {
      const folder = db.prepare("SELECT 1 FROM file_folders WHERE id = ? AND project_id = ?").get(target, projectId);
      if (!folder) throw new Error(`文件夹 ${target} 不存在或不属于该项目`);
    }
    if ((file.folder_id || null) === target) {
      return getFile(projectId, fileId);
    }
    db.prepare("UPDATE files SET folder_id = ? WHERE id = ?").run(target, fileId);
    logAudit(projectId, "移动文件", "file", fileId,
      JSON.stringify({ name: file.name, folderId: file.folder_id || null }),
      JSON.stringify({ name: file.name, folderId: target }));
    return getFile(projectId, fileId);
  }

  function deleteFile(projectId, fileId) {
    const row = db.prepare("SELECT name FROM files WHERE id = ? AND project_id = ?").get(fileId, projectId);
    db.prepare("DELETE FROM files WHERE id = ? AND project_id = ?").run(fileId, projectId);
    if (row) logAudit(projectId, "删除文件", "file", fileId, JSON.stringify({ name: row.name }), null);
    return true;
  }

  function getFilePath(projectId, fileId) {
    const row = db.prepare("SELECT path FROM files WHERE id = ? AND project_id = ?").get(fileId, projectId);
    return row ? row.path : null;
  }

  // ===== Folders（V2.1.4 文件系统重构：多层嵌套文件夹） =====

  /**
   * 文件夹名校验：非空 + 长度限制，返回错误信息（null=通过）
   */
  function folderNameError(name) {
    if (name === undefined || name === null) return "文件夹名称不能为空";
    const s = String(name).trim();
    if (!s) return "文件夹名称不能为空";
    if (s.length > 50) return "文件夹名称最多50个字符";
    return null;
  }

  /**
   * 同级重名校验：同一父级下 name 唯一（parentId 不同可同名）
   * @param {string} projectId
   * @param {string} name 已 trim 的名称
   * @param {string|null} parentId 父级（null=根）
   * @param {string} excludeId 排除自身（更新时传入，防自己拦自己）
   */
  function assertFolderSameLevelName(projectId, name, parentId, excludeId) {
    const row = db.prepare(
      "SELECT 1 FROM file_folders WHERE project_id = ? AND name = ? AND parent_id IS ? AND id != ?"
    ).get(projectId, name, parentId || null, excludeId || "");
    if (row) throw new Error(`同级下已存在文件夹「${name}」`);
  }

  /**
   * 取文件夹行，不存在或不属于该项目则抛错
   */
  function getFolderOrThrow(projectId, folderId) {
    const row = db.prepare(
      "SELECT id, project_id, parent_id, name, created_at FROM file_folders WHERE id = ? AND project_id = ?"
    ).get(folderId, projectId);
    if (!row) throw new Error(`文件夹 ${folderId} 不存在`);
    return row;
  }

  /**
   * 防环：newParentId 的祖先链中出现 folderId（把自己或子孙设为父级）则成环
   */
  function wouldCreateFolderCycle(projectId, folderId, newParentId) {
    let cur = newParentId;
    const seen = new Set();
    while (cur) {
      if (cur === folderId) return true;
      if (seen.has(cur)) return true; // 历史脏数据兜底，防死循环
      seen.add(cur);
      const row = db.prepare("SELECT parent_id FROM file_folders WHERE id = ? AND project_id = ?").get(cur, projectId);
      if (!row) return false; // 父链断裂（脏数据），视为可挂载
      cur = row.parent_id;
    }
    return false;
  }

  /**
   * 创建文件夹（多层嵌套，parentId 可空=根目录）
   * @param {string} projectId
   * @param {{ name: string, parentId?: string|null }} data
   */
  function createFolder(projectId, data) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const nameErr = folderNameError(data?.name);
    if (nameErr) throw new Error(nameErr);
    const name = String(data.name).trim();
    const parentId = data?.parentId || null;
    if (parentId) {
      const parent = db.prepare("SELECT 1 FROM file_folders WHERE id = ? AND project_id = ?").get(parentId, projectId);
      if (!parent) throw new Error(`父文件夹 ${parentId} 不存在或不属于该项目`);
    }
    assertFolderSameLevelName(projectId, name, parentId, null);
    const folder = {
      id: shortId(),
      project_id: projectId,
      parent_id: parentId,
      name,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO file_folders (id, project_id, parent_id, name, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(folder.id, folder.project_id, folder.parent_id, folder.name, folder.created_at);
    logAudit(projectId, "创建文件夹", "folder", folder.id, null,
      JSON.stringify({ name: folder.name, parentId: folder.parent_id || null }));
    return { id: folder.id, name: folder.name, parentId: folder.parent_id || null, createdAt: folder.created_at };
  }

  /**
   * 更新文件夹：改名 + 换父级（可只传其一）
   * 重名校验基于最终父级（改名+换父同时发生时按新父级判断）；换父防环（不能把自己/子孙设为父级）
   * @param {string} projectId
   * @param {string} folderId
   * @param {{ name?: string, parentId?: string|null }} data
   */
  function updateFolder(projectId, folderId, data) {
    const cur = getFolderOrThrow(projectId, folderId);
    const nextName = data?.name !== undefined ? String(data.name).trim() : cur.name;
    const nameErr = folderNameError(nextName);
    if (nameErr) throw new Error(nameErr);
    let nextParent = cur.parent_id || null;
    if (data?.parentId !== undefined) {
      nextParent = data.parentId || null;
      if (nextParent === folderId) throw new Error("不能将文件夹移动到自身下面");
      if (nextParent) {
        const p = db.prepare("SELECT 1 FROM file_folders WHERE id = ? AND project_id = ?").get(nextParent, projectId);
        if (!p) throw new Error(`父文件夹 ${nextParent} 不存在或不属于该项目`);
        if (wouldCreateFolderCycle(projectId, folderId, nextParent)) throw new Error("不能移动到自己的子文件夹下面");
      }
    }
    // 存在实际变更时才校验最终态同级重名（同名不改不拦）
    const nameChanged = nextName !== cur.name;
    const parentChanged = nextParent !== (cur.parent_id || null);
    if (nameChanged || parentChanged) {
      assertFolderSameLevelName(projectId, nextName, nextParent, folderId);
    }
    const sets = [];
    const params = [];
    if (nameChanged) { sets.push("name = ?"); params.push(nextName); }
    if (parentChanged) { sets.push("parent_id = ?"); params.push(nextParent); }
    if (sets.length) {
      params.push(folderId);
      db.prepare(`UPDATE file_folders SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      logAudit(projectId, "更新文件夹", "folder", folderId,
        JSON.stringify({ name: cur.name, parentId: cur.parent_id || null }),
        JSON.stringify({ name: nextName, parentId: nextParent }));
    }
    return { id: cur.id, name: nextName, parentId: nextParent, createdAt: cur.created_at };
  }

  /**
   * 删除文件夹（真删除语义）：递归删除其下所有子孙文件夹与这些文件夹内的文件登记，
   * 不保留结构（用户拍板：删除 = 文件夹及下面 n 个文件一起删）。磁盘文件不碰（登记语义）。
   */
  function deleteFolder(projectId, folderId) {
    const cur = getFolderOrThrow(projectId, folderId);
    const run = db.transaction(() => {
      // 递归收集该夹 + 全部子孙夹 id
      const ids = [folderId];
      const collect = (parentId) => {
        const children = db.prepare(
          "SELECT id FROM file_folders WHERE project_id = ? AND parent_id = ?"
        ).all(projectId, parentId);
        for (const c of children) {
          ids.push(c.id);
          collect(c.id);
        }
      };
      collect(folderId);
      const placeholders = ids.map(() => "?").join(",");
      // V2.3.1 补审：先取这些文件夹下的文件明细（磁盘文件不动），删除后逐条审计（与 deleteFile 同款字段）
      const fileRows = db.prepare(
        `SELECT id, name FROM files WHERE project_id = ? AND folder_id IN (${placeholders})`
      ).all(projectId, ...ids);
      db.prepare(`DELETE FROM files WHERE project_id = ? AND folder_id IN (${placeholders})`)
        .run(projectId, ...ids);
      db.prepare(`DELETE FROM file_folders WHERE project_id = ? AND id IN (${placeholders})`)
        .run(projectId, ...ids);
      return { folderCount: ids.length, fileRows };
    });
    const { folderCount, fileRows } = run();
    // 级联删除的文件逐条审计（动作名/字段与 deleteFile 一致）；文件夹本体审计保持原样
    for (const f of fileRows) {
      logAudit(projectId, "删除文件", "file", f.id, JSON.stringify({ name: f.name }), null);
    }
    logAudit(projectId, "删除文件夹", "folder", folderId,
      JSON.stringify({ name: cur.name, deletedFolders: folderCount, deletedFiles: fileRows.length }), null);
    return { id: folderId, deletedFolders: folderCount, deletedFiles: fileRows.length };
  }

  /**
   * 取单个文件夹，不存在返回 null
   */
  function getFolder(projectId, folderId) {
    const row = db.prepare(
      "SELECT id, parent_id, name, created_at FROM file_folders WHERE id = ? AND project_id = ?"
    ).get(folderId, projectId);
    if (!row) return null;
    return { id: row.id, parentId: row.parent_id || null, name: row.name, createdAt: row.created_at };
  }

  /**
   * 列项目文件夹树（多层嵌套，children 递归挂载；parent 断链的脏数据挂根兜底）
   */
  function listFolders(projectId) {
    const rows = db.prepare(
      "SELECT id, parent_id, name, created_at FROM file_folders WHERE project_id = ? ORDER BY created_at, id"
    ).all(projectId);
    const nodes = rows.map((r) => ({
      id: r.id, parentId: r.parent_id || null, name: r.name, createdAt: r.created_at, children: [],
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots = [];
    for (const n of nodes) {
      if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId).children.push(n);
      else roots.push(n);
    }
    return roots;
  }

  // ===== Notes =====

  /**
   * 富文本内容判空：先清洗，再判断无文本且无资源标签（P1-3：只含图片不被误判为空）
   */
  function noteContentEmpty(content) {
    return richTextEmpty(content);
  }

  function createNote(projectId, data) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    if (noteContentEmpty(data.content)) throw new Error("备注内容不能为空");
    const note = {
      id: shortId(),
      project_id: projectId,
      content: sanitizeHtml(data.content),
      created_at: new Date().toISOString().slice(0, 10),
    };
    db.prepare(
      "INSERT INTO notes (id, project_id, content, created_at) VALUES (?, ?, ?, ?)"
    ).run(note.id, note.project_id, note.content, note.created_at);
    logAudit(projectId, "创建备注", "note", note.id, null, JSON.stringify({ content: auditText(note.content) }));
    return { id: note.id, content: note.content, createdAt: note.created_at };
  }

  function updateNote(projectId, noteId, data) {
    const cur = db.prepare("SELECT id, content FROM notes WHERE id = ? AND project_id = ?").get(noteId, projectId);
    if (!cur) throw new Error(`备注不存在`);
    if (data.content !== undefined) {
      if (noteContentEmpty(data.content)) throw new Error("备注内容不能为空");
      db.prepare("UPDATE notes SET content = ? WHERE id = ?").run(sanitizeHtml(data.content), noteId);
      logAudit(projectId, "更新备注", "note", noteId,
        JSON.stringify({ content: auditText(cur.content) }),
        JSON.stringify({ content: auditText(sanitizeHtml(data.content)) }));
    }
    const after = db.prepare("SELECT id, content, created_at FROM notes WHERE id = ?").get(noteId);
    return { id: after.id, content: after.content, createdAt: after.created_at };
  }

  function deleteNote(projectId, noteId) {
    const row = db.prepare("SELECT content FROM notes WHERE id = ? AND project_id = ?").get(noteId, projectId);
    db.prepare("DELETE FROM notes WHERE id = ? AND project_id = ?").run(noteId, projectId);
    if (row) logAudit(projectId, "删除备注", "note", noteId, JSON.stringify({ content: auditText(row.content) }), null);
    return true;
  }

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

  // ===== 旧版 SubTask API 兼容（保留对外函数名）=====

  function createSubTask(projectId, taskId, data) {
    // 兼容旧 API：视为在某 task 下创建子任务
    return createTask(projectId, { ...data, parentTaskId: taskId });
  }

  function updateSubTask(projectId, taskId, subTaskId, data) {
    return updateTask(projectId, subTaskId, data);
  }

  function deleteSubTask(projectId, taskId, subTaskId) {
    return deleteTask(projectId, subTaskId);
  }

  /**
   * 检测移动是否会成环：从目标父级沿 parent 链上溯，若遇到被移动任务则成环
   */
  function wouldCreateCycle(projectId, taskId, parentTaskId) {
    let cur = db
      .prepare("SELECT parent_task_id FROM tasks WHERE id = ? AND project_id = ?")
      .get(parentTaskId, projectId);
    const seen = new Set();
    while (cur && cur.parent_task_id) {
      if (cur.parent_task_id === taskId) return true;
      if (seen.has(cur.parent_task_id)) return false;
      seen.add(cur.parent_task_id);
      cur = db
        .prepare("SELECT parent_task_id FROM tasks WHERE id = ? AND project_id = ?")
        .get(cur.parent_task_id, projectId);
    }
    return false;
  }

  /**
   * 移动任务到指定父级下的指定位置（跨层级拖拽落点）
   * @param {string} projectId
   * @param {string} taskId 被移动的任务
   * @param {string|null} parentTaskId 目标父任务（null = 顶层）
   * @param {number} index 目标父级下的插入位置
   */
  function moveTask(projectId, taskId, parentTaskId, index) {
    getTaskOrThrow(projectId, taskId);
    if (parentTaskId) {
      getTaskOrThrow(projectId, parentTaskId);
      if (parentTaskId === taskId) throw new Error("不能移动到自身下面");
      if (wouldCreateCycle(projectId, taskId, parentTaskId)) throw new Error("不能移动到自己的子任务下面");
    }
    // V2.3.1 补审：移动前旧位置（parent_task_id + index_num）留作审计 oldValue
    const before = db.prepare("SELECT parent_task_id, index_num FROM tasks WHERE id = ?").get(taskId);
    // 目标父级下的现有兄弟（排除被移动任务自身）
    const rows = db
      .prepare("SELECT id FROM tasks WHERE project_id = ? AND parent_task_id IS ? ORDER BY index_num")
      .all(projectId, parentTaskId || null);
    const siblings = rows.map((r) => r.id).filter((id) => id !== taskId);
    const pos = Math.max(0, Math.min(index | 0, siblings.length));
    siblings.splice(pos, 0, taskId);
    db.transaction(() => {
      db.prepare("UPDATE tasks SET parent_task_id = ? WHERE id = ?").run(parentTaskId || null, taskId);
      const upd = db.prepare("UPDATE tasks SET index_num = ? WHERE id = ?");
      siblings.forEach((id, i) => upd.run(i, id));
    })();
    logAudit(projectId, "移动任务", "task", taskId,
      JSON.stringify({ parentTaskId: before?.parent_task_id || null, index: before?.index_num ?? null }),
      JSON.stringify({ parentTaskId: parentTaskId || null, index: pos }));
    return getProjectFull(projectId)?.tasks || [];
  }

  // ===== 图片上传（富文本内嵌图，存 plugin-data/uploads/）=====

  const UPLOAD_ALLOWED_EXT = ["png", "jpg", "jpeg", "gif", "webp"];
  const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

  // 文件头魔数校验（防伪装扩展名，P1-2）
  function matchesMagic(buffer, ext) {
    const b = [...buffer.subarray(0, 12)];
    const eq = (arr) => arr.every((v, i) => b[i] === v);
    if (ext === "png") return eq([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (ext === "jpg" || ext === "jpeg") return eq([0xff, 0xd8, 0xff]);
    if (ext === "gif") return eq([0x47, 0x49, 0x46, 0x38]);
    if (ext === "webp") return eq([0x52, 0x49, 0x46, 0x46]) && eq([0x57, 0x45, 0x42, 0x50]);
    return false;
  }

  /**
   * 保存上传的图片（单图 ≤ 2MB，仅 png/jpg/jpeg/gif/webp，魔数校验）
   * @param {Buffer} buffer 文件二进制
   * @param {string} filename 原始文件名（用于取扩展名）
   * @returns {{name: string, url: string}} name=落盘文件名（shortId+ext），url 由路由层补全前缀
   */
  function saveUploadedFile(buffer, filename) {
    const ext = (path.extname(filename || "").slice(1) || "").toLowerCase();
    if (!UPLOAD_ALLOWED_EXT.includes(ext)) {
      throw new Error(`仅支持 ${UPLOAD_ALLOWED_EXT.join(" / ")} 图片`);
    }
    if (!buffer || buffer.length === 0) throw new Error("文件内容为空");
    if (buffer.length > UPLOAD_MAX_BYTES) throw new Error("单图不能超过 2MB");
    if (!matchesMagic(buffer, ext)) throw new Error("文件内容与扩展名不符（魔数校验失败）");
    const dir = path.join(dataDir, "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const name = `${shortId()}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    return { name, url: name };
  }

  // ===== 日历任务（任务日历 tab 数据源）=====

  /**
   * 列出有起止日期的任务（日历事件源）
   * @param {string} status done=已完成 / undone=未完成 / all=全部（默认 undone）
   * @param {string|undefined} projectId 限定项目（可选）
   * @returns {Array<{id,name,startDate,endDate,projectId,done,parentTaskId,assignees,projectName,projectSetId}>}
   */
  function listCalendarTasks(status = "undone", projectId) {
    const where = ["(t.start_date IS NOT NULL OR t.end_date IS NOT NULL)"];
    const params = [];
    if (projectId) {
      where.push("t.project_id = ?");
      params.push(projectId);
    }
    if (status === "done") where.push("t.done = 1");
    else if (status === "undone") where.push("t.done = 0");
    const rows = db.prepare(`
      SELECT t.id, t.project_id, t.parent_task_id, t.name, t.done, t.assignees, t.start_date, t.end_date, t.is_milestone,
             p.name AS project_name, p.project_set_id
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(t.start_date, t.end_date)
    `).all(...params);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date || "",
      endDate: r.end_date || "",
      projectId: r.project_id,
      done: !!r.done,
      parentTaskId: r.parent_task_id,
      assignees: parseAssignees(r.assignees),
      isMilestone: !!r.is_milestone,
      projectName: r.project_name,
      projectSetId: r.project_set_id || "",
    }));
  }

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
    // 版本管理：内容实际变化才存版（保存后的状态）
    saveVersion(projectId, "plan", planId, {
      title: diff.title ?? cur.title,
      content: diff.content ?? cur.content,
      extra: { status: diff.status ?? cur.status },
    });
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
    const comments = getComments(projectId, "plan", resolvedId);
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

  // ===== 版本管理（V2.6，versions 表：需求/方案共用）=====

  const VERSION_KEEP = 50; // 每 target 保留最近 50 版

  /**
   * 存一版快照（保存后的状态）。仅内容实际变化时由调用方触发；创建时存 v1。
   * @param {string} projectId
   * @param {'plan'|'requirement'} targetType
   * @param {string} targetId
   * @param {{title:string, content:string, extra?:object}} snap
   * @param {string} author
   */
  function saveVersion(projectId, targetType, targetId, snap, author = null) {
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
      author, new Date().toISOString()
    );
    // 容量清理：超出保留数删最旧（按 version_no 升序）
    db.prepare(`
      DELETE FROM versions
      WHERE target_type = ? AND target_id = ? AND version_no <= ?
    `).run(targetType, targetId, no - VERSION_KEEP);
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

  // ===== 统一评论（V2.6，comments 表：需求/方案共用）=====

  const COMMENT_TARGET_TYPES = ["plan", "requirement"];

  function commentRowToObject(r) {
    return {
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      content: r.content,
      author: r.author || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at || null,
      edited: !!r.edited,
      quoteText: r.quote_text || null,
    };
  }

  function getComments(projectId, targetType, targetId) {
    const rows = db.prepare(
      "SELECT * FROM comments WHERE project_id = ? AND target_type = ? AND target_id = ? ORDER BY created_at DESC, id"
    ).all(projectId, targetType, targetId);
    return rows.map(commentRowToObject);
  }

  function addComment(projectId, targetType, targetId, content, quote = null, quoteAnchor = null) {
    if (!COMMENT_TARGET_TYPES.includes(targetType)) {
      throw new Error(`不支持的评论对象类型: ${targetType}（可选 plan / requirement）`);
    }
    // 归属校验（短前缀解析 + 存在性）：方案/需求各自的解析器
    if (targetType === "plan") {
      getPlanRowOrThrow(projectId, targetId);
    } else {
      const req = resolveRowById("requirements", "id", "project_id", projectId, targetId, "需求", (r) => r.name);
      if (!req) throw new Error(`需求 ${targetId} 不存在`);
      targetId = req.id;
    }
    const t = String(content || "").trim();
    if (!t) throw new Error("评论内容不能为空");
    const comment = {
      id: shortId(), projectId, targetType, targetId, content: t,
      quoteText: quote ? String(quote) : null,
      quoteAnchor: quoteAnchor ? String(quoteAnchor) : null,
      createdAt: new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO comments (id, project_id, target_type, target_id, content, author, created_at, quote_text, quote_anchor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(comment.id, projectId, targetType, targetId, comment.content, null, comment.createdAt, comment.quoteText, comment.quoteAnchor);
    logAudit(projectId, "添加评论", "comment", comment.id, null,
      JSON.stringify({ targetType, targetId, content: auditText(t) }));
    markFtsDirty(projectId);
    return commentRowToObject(db.prepare("SELECT * FROM comments WHERE id = ?").get(comment.id));
  }

  function updateComment(projectId, commentId, content) {
    const row = db.prepare("SELECT * FROM comments WHERE id = ? AND project_id = ?").get(commentId, projectId);
    if (!row) throw new Error(`评论 ${commentId} 不存在`);
    const t = String(content || "").trim();
    if (!t) throw new Error("评论内容不能为空");
    const now = new Date().toISOString();
    db.prepare("UPDATE comments SET content = ?, updated_at = ?, edited = 1 WHERE id = ?")
      .run(t, now, commentId);
    logAudit(projectId, "编辑评论", "comment", commentId,
      JSON.stringify({ content: auditText(row.content) }),
      JSON.stringify({ content: auditText(t) }));
    markFtsDirty(projectId);
    return commentRowToObject(db.prepare("SELECT * FROM comments WHERE id = ?").get(commentId));
  }

  function deleteComment(projectId, commentId) {
    const row = db.prepare("SELECT * FROM comments WHERE id = ? AND project_id = ?").get(commentId, projectId);
    if (!row) throw new Error(`评论 ${commentId} 不存在`);
    db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
    // 删除审计带内容快照，可追溯删了什么
    logAudit(projectId, "删除评论", "comment", commentId,
      JSON.stringify({ targetType: row.target_type, targetId: row.target_id, content: auditText(row.content) }), null);
    markFtsDirty(projectId);
    return true;
  }

  function convertPlanToTask(projectId, planId) {
    const cur = getPlanRowOrThrow(projectId, planId);
    // 仅「已采纳」状态的方案可转任务（拍板后才执行）
    if (cur.status !== "已采纳") throw new Error("仅「已采纳」状态的方案可转为任务");
    if (cur.task_id) {
      const exists = db.prepare("SELECT id FROM tasks WHERE id = ?").get(cur.task_id);
      if (exists) throw new Error("该方案已转为任务，不能重复转换");
    }
    // 任务名 = 方案标题（截断至任务名上限 60 字），描述 = 方案内容（富文本 HTML 保留）
    // V2.2 R14：planIds=[planId] 让任务创建时即写 task_plans 双向关联
    const { task, planIds } = buildTaskObject(projectId, {
      name: cur.title.length > 60 ? `${cur.title.slice(0, 60)}…` : cur.title,
      description: cur.content,
      priority: "P3",
      planIds: [planId],
    });
    // 三步并入同一事务：INSERT 任务 + INSERT task_plans + UPDATE plans.task_id，任一步失败整体回滚
    db.transaction(() => {
      insertTaskWithRefs(task, [], planIds);
      db.prepare("UPDATE plans SET task_id = ?, updated_at = ? WHERE id = ? AND project_id = ?")
        .run(task.id, new Date().toISOString(), planId, projectId);
    })();
    // 审计：转任务实际创建了任务，保留「创建任务」留痕（与 createTask 同款字段）+「方案转任务」留痕
    logAudit(projectId, "创建任务", "task", task.id, null, JSON.stringify({
      name: task.name,
      done: false,
      assignees: parseAssignees(task.assignees),
      startDate: task.start_date || "",
      endDate: task.end_date || "",
      priority: task.priority,
      isMilestone: !!task.is_milestone,
      parentTaskId: task.parent_task_id || null,
    }));
    logAudit(projectId, "方案转任务", "plan", planId, JSON.stringify({ taskId: task.id, title: cur.title }), null);
    return { planId, taskId: task.id, taskName: task.name };
  }

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
      comments: getComments(projectId, "requirement", resolvedId),
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
      // 版本管理：内容实际变化才存版（保存后的状态）
      if (Object.keys(diff).length) {
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

  function deleteRequirement(projectId, id) {
    const row = db.prepare("SELECT name, status FROM requirements WHERE id = ? AND project_id = ?").get(id, projectId);
    if (!row) throw new Error(`需求 ${id} 不存在`);
    // V2.1.4：已完成的需求保留交付记录，禁止删除（仅待处理/已取消可删）
    if (row.status === "已完成") throw new Error("已完成的需求不可删除");
    const run = db.transaction(() => {
      db.prepare("DELETE FROM requirement_plans WHERE requirement_id = ?").run(id);
      // V2.6：评论表无 SQL 外键（同列多引用），应用层级联清评论
      db.prepare("DELETE FROM comments WHERE target_type = 'requirement' AND target_id = ?").run(id);
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

  // ===== 项目总结与风险识别（V2.0 S10）=====

  // —— 风险规则默认配置（项目级可覆盖，UI 齿轮弹窗 / PUT risk-config 修改）——
  const DEFAULT_RISK_CONFIG = {
    delayed:           { enabled: true, days: 0,     level: "high"   }, // 1.任务延期
    nearDeadline:      { enabled: true, days: 3,     level: "medium" }, // 2.逼近截止
    annotationBacklog: { enabled: true, minCount: 3, level: "medium" }, // 3.待确认批注积压
    projectOverdue:    { enabled: true,             level: "high"   }, // 4.项目逾期
    noDateTasks:       { enabled: true, minTotal: 3, ratio: 0.6, level: "low" }, // 5.任务缺日期
    projectStagnant:   { enabled: true,             level: "medium" }, // 6.项目停滞
  };
  const RISK_LEVELS = new Set(["high", "medium", "low"]);
  const RISK_RULE_KEYS = new Set(Object.keys(DEFAULT_RISK_CONFIG));
  // 每规则可配字段白名单（校验用，防止脏字段/类型错误入库）
  const RISK_FIELD_TYPES = {
    enabled: "boolean",
    days: "int",
    minCount: "int",
    minTotal: "int",
    ratio: "number",
    level: "level",
    unconfirmedLevel: "level",
    confirmedLevel: "level",
  };

  /**
   * 读取项目风险规则配置（未配置/缺失字段用默认值补齐）
   * @param {string} projectId
   * @returns {object} 完整配置（结构同 DEFAULT_RISK_CONFIG）
   */
  function getRiskConfig(projectId) {
    const row = db.prepare("SELECT risk_config FROM projects WHERE id = ?").get(projectId);
    if (!row) return null;
    let stored = null;
    if (row.risk_config) {
      try { stored = JSON.parse(row.risk_config); } catch { stored = null; }
    }
    // 兼容两种存储形态：{ rules: {...} }（老数据）或直接 {...}（本版写入）
    const rulesMap = stored?.rules ?? stored;
    const cfg = { rules: {} };
    for (const key of RISK_RULE_KEYS) {
      const def = DEFAULT_RISK_CONFIG[key];
      const src = rulesMap?.[key];
      const rule = {};
      for (const [field, type] of Object.entries(RISK_FIELD_TYPES)) {
        const v = src?.[field];
        if (v === undefined || v === null) { rule[field] = def[field]; continue; }
        if (type === "boolean") rule[field] = !!v;
        else if (type === "int") rule[field] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : def[field];
        else if (type === "number") rule[field] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : def[field];
        else if (type === "level") rule[field] = RISK_LEVELS.has(v) ? v : def[field];
        else rule[field] = v;
      }
      cfg.rules[key] = rule;
    }
    return cfg;
  }

  /**
   * 更新项目风险规则配置（白名单校验，非法字段忽略；整体替换 rules）
   * @param {string} projectId
   * @param {object} rules 结构同 DEFAULT_RISK_CONFIG.rules（可只传部分，缺失用默认）
   * @returns {object} 合并后完整配置
   */
  function updateRiskConfig(projectId, rules) {
    const cur = getRiskConfig(projectId);
    if (!cur) throw new Error(`项目 ${projectId} 不存在`);
    const src = (rules && typeof rules === "object") ? rules : {};
    const merged = { rules: {} };
    for (const key of RISK_RULE_KEYS) {
      const def = DEFAULT_RISK_CONFIG[key];
      const s = src[key] && typeof src[key] === "object" ? src[key] : {};
      const rule = {};
      for (const [field, type] of Object.entries(RISK_FIELD_TYPES)) {
        const v = s[field];
        if (v === undefined || v === null) { rule[field] = def[field]; continue; }
        if (type === "boolean") rule[field] = !!v;
        else if (type === "int") rule[field] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : def[field];
        else if (type === "number") rule[field] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : def[field];
        else if (type === "level") rule[field] = RISK_LEVELS.has(v) ? v : def[field];
        else rule[field] = v;
      }
      merged.rules[key] = rule;
    }
    db.prepare("UPDATE projects SET risk_config = ? WHERE id = ?")
      .run(JSON.stringify(merged.rules), projectId);
    logAudit(projectId, "更新风险配置", "project", projectId, JSON.stringify(cur.rules), JSON.stringify(merged.rules));
    return merged;
  }

  /**
   * 文本截断限长（防刷屏）
   * @param {*} s
   * @param {number} max
   * @returns {string}
   */
  function truncateText(s, max = 30) {
    const t = String(s ?? "").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }

  /**
   * 富文本/HTML → 纯文本（去标签、压缩空白）
   * @param {*} s
   * @returns {string}
   */
  function htmlToPlain(s) {
    return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * 本地日期 YYYY-MM-DD（勿用 toISOString：UTC 可能跨日）
   * @returns {string}
   */
  function localToday() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * 当前本地时间 ISO 字符串（YYYY-MM-DDTHH:mm:ss，无时区后缀，代表本地时间）
   * 与 localToday 的本地时区语义一致；done_at 落库用（toISOString 是 UTC，会跨日偏差）
   */
  function localNowIso() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /**
   * YYYY-MM-DD 日期加减 N 天（返回 YYYY-MM-DD）
   * @param {string} d
   * @param {number} days
   * @returns {string}
   */
  function addDays(d, days) {
    const [y, m, dd] = String(d).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    dt.setUTCDate(dt.getUTCDate() + days);
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
  }

  /**
   * 两个 YYYY-MM-DD 的差值天数（a - b；UTC 显式解析避免时区/夏令时偏移）
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  function diffDays(a, b) {
    const DAY_MS = 86400000;
    return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
  }

  /**
   * 递归展开任务树（含全部后代，保持树序遍历顺序）
   * @param {Array} tasks
   * @param {Array} [out]
   * @returns {Array}
   */
  function flattenTaskTree(tasks, out = []) {
    for (const t of tasks || []) {
      out.push(t);
      flattenTaskTree(t.subtasks, out);
    }
    return out;
  }

  /**
   * 汇总项目全部结构化数据，生成固定模板的状态总结（V2.0 S10）
   *
   * 数据源：getProject 的任务树（done/日期/批注）+ files，纯计算无 AI 依赖
   * 输出与需求 1.1 模板同构：project/summary/completed/pending/delayed/risks/
   * pendingAnnotations/files/nextSteps；risks 按等级 high → medium → low 排序
   *
   * @param {string} projectId
   * @returns {object|null} 模板 JSON；项目不存在返回 null
   */
  function summarizeProject(projectId) {
    const project = getProject(projectId);
    if (!project) return null;

    const cfg = getRiskConfig(projectId); // 项目级风险规则配置（未配置=默认）
    const R = cfg ? cfg.rules : null;

    const today = localToday();
    const all = flattenTaskTree(project.tasks); // 全部任务节点（含子任务）
    const total = all.length;
    const doneTasks = all.filter((t) => t.done);
    const pendingTasks = all.filter((t) => !t.done);
    const progress = total === 0 ? 0 : Math.round((doneTasks.length / total) * 100);

    // —— 延期 / 逼近截止（endDate 用 YYYY-MM-DD 字符串比较，同日无时区问题）——
    // 延期阈值/逼近窗口可配置（risk_config）；days=0 表示超过今天即算延期
    const delayDays = R ? Math.max(0, R.delayed.days) : 0;
    const nearDays = R ? Math.max(0, R.nearDeadline.days) : 3;
    const delayed = pendingTasks
      .filter((t) => t.endDate && diffDays(today, t.endDate) > delayDays)
      .map((t) => ({ id: t.id, task: t.name, name: t.name, days: diffDays(today, t.endDate) }))
      .sort((a, b) => b.days - a.days);
    const nearDeadline = pendingTasks.filter((t) => {
      if (!t.endDate) return false;
      const d = diffDays(t.endDate, today);
      return d >= 0 && d <= nearDays; // 含今天，nearDays 天内到期
    });

    // —— 待确认批注（kind 随批注类型，S3）——
    const pendingAnnotations = [];
    for (const t of all) {
      for (const a of t.annotations || []) {
        if (!a.confirmed) {
          pendingAnnotations.push({
            taskId: t.id,
            annotationId: a.id,
            task: t.name,
            name: t.name,
            content: htmlToPlain(a.content),
            createdAt: a.createdAt,
            kind: a.kind || "note",
          });
        }
      }
    }
    pendingAnnotations.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    // —— 风险识别（7 条规则，阈值/开关/等级由项目级 risk_config 配置，缺省=默认值）——
    const risks = [];
    const overdueProject = project.status !== "已完成" && !!project.planEnd && project.planEnd < today;
    const noDateTasks = all.filter((t) => !t.startDate && !t.endDate);
    const noDateCount = noDateTasks.length;

    // 1. 延期（level/days 可配）：任务 endDate 早于今天-days 天 且 未完成
    if ((!R || R.delayed.enabled) && delayed.length > 0) {
      risks.push({ level: R?.delayed.level || "high", desc: `${delayed.length} 个任务已延期（最长延期 ${delayed[0].days} 天）`, tasks: delayed.map((t) => ({ id: t.id, name: t.name })), category: "task" });
    }
    // 2. 逼近截止（level/days 可配）：任务 endDate 在 days 天内 且 未完成
    if ((!R || R.nearDeadline.enabled) && nearDeadline.length > 0) {
      risks.push({ level: R?.nearDeadline.level || "medium", desc: `${nearDeadline.length} 个任务将在 ${nearDays} 天内到期`, tasks: nearDeadline.map((t) => ({ id: t.id, name: t.name })), category: "task" });
    }
    // 3. 批注积压（level/minCount 可配）：待确认批注 ≥ minCount
    if ((!R || R.annotationBacklog.enabled) && pendingAnnotations.length >= (R?.annotationBacklog.minCount ?? 3)) {
      // 每条批注一项（带 annotationId + 内容，供前端定位到具体批注）
      risks.push({
        level: R?.annotationBacklog.level || "medium",
        desc: `${pendingAnnotations.length} 条待确认批注待处理`,
        tasks: pendingAnnotations.map((a) => ({
          id: a.taskId,
          name: a.name,
          annotationId: a.annotationId,
          content: a.content,
        })),
        category: "annotation",
      });
    }
    // 4. 项目逾期（level 可配）：项目 planEnd < 今天 且 未完成
    if ((!R || R.projectOverdue.enabled) && overdueProject) {
      risks.push({ level: R?.projectOverdue.level || "high", desc: `项目已超过计划结束日期（${project.planEnd}）`, tasks: [], category: "project" });
    }
    // 5. 任务无日期（level/minTotal/ratio 可配）：任务数 ≥ minTotal 且无日期任务 ≥ ratio
    if ((!R || R.noDateTasks.enabled) && total >= (R?.noDateTasks.minTotal ?? 3) && noDateCount / total >= (R?.noDateTasks.ratio ?? 0.6)) {
      risks.push({ level: R?.noDateTasks.level || "low", desc: `${noDateCount}/${total} 个任务缺少起止日期`, tasks: noDateTasks.map((t) => ({ id: t.id, name: t.name })), category: "task" });
    }
    // 6. 项目停滞（level 可配）：状态「进行中」但 0 个未完成任务
    if ((!R || R.projectStagnant.enabled) && project.status === "进行中" && pendingTasks.length === 0) {
      risks.push({ level: R?.projectStagnant.level || "medium", desc: "项目状态为「进行中」但没有未完成任务", tasks: [], category: "project" });
    }
    // 排序：类别优先（项目 → 任务 → 批注），类别内按等级 high → medium → low
    const CATEGORY_ORDER = { project: 0, task: 1, annotation: 2 };
    const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => {
      const c = (CATEGORY_ORDER[a.category] ?? 1) - (CATEGORY_ORDER[b.category] ?? 1);
      if (c !== 0) return c;
      return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    });

    // —— 完成/未完成关键项（全量不截断；Agent 侧需要完整进度清单，展示层截断由消费方自行处理）——
    const completed = doneTasks.map((t) => t.name);
    const pending = pendingTasks.map((t) => t.name);

    // —— 概览面板结构化任务列表（带 id，供 popover 快速定位；全量不截断）——
    const pendingTaskItems = pendingTasks.map((t) => ({ id: t.id, name: t.name }));
    const noDateTaskItems = noDateTasks.map((t) => ({ id: t.id, name: t.name }));

    // —— 文件资产（全量清单，名称/摘要不截断）——
    const files = (project.files || []).map((f) => ({
      name: f.name,
      ext: f.ext || "",
      size: f.size ?? 0,
      digest: f.digest ? htmlToPlain(f.digest) : "",
    }));

    // —— summary 一句话（规则生成）——
    let summary;
    if (total === 0) {
      summary = `${project.status}，暂无任务`;
    } else if (project.status === "已完成") {
      summary = `已完成，共 ${total} 个任务`;
    } else {
      summary = `${project.status}，完成度 ${progress}%，剩余 ${pendingTasks.length} 个任务`;
      if (delayed.length > 0) summary += `，${delayed.length} 个延期任务`;
      else if (overdueProject) summary += `，已超过计划结束日期`;
      if (pendingAnnotations.length >= (R?.annotationBacklog.minCount ?? 3)) summary += `，${pendingAnnotations.length} 条待确认批注`;
    }

    // —— nextSteps（规则生成，高风险动作优先）——
    const nextSteps = [];
    // 已取消：不产生动作建议，仅提示可重启
    if (project.status === "已取消") {
      nextSteps.push("随时可以重启项目继续推进");
    } else if (project.archived) {
      // 已归档：不输出文字，前端走撒花缺省态（完结文案）
    } else {
      if (delayed.length > 0) nextSteps.push(`优先完成 ${delayed.length} 个延期任务（最长延期 ${delayed[0].days} 天）`);
      if (overdueProject) nextSteps.push("重新评估项目计划：压缩范围或调整结束日期");
      if (nearDeadline.length > 0) nextSteps.push(`关注 ${nearDeadline.length} 个临近截止任务，避免新增延期`);
      if (pendingAnnotations.length >= (R?.annotationBacklog.minCount ?? 3)) nextSteps.push(`处理 ${pendingAnnotations.length} 条待确认批注`);
      if (total >= (R?.noDateTasks.minTotal ?? 3) && noDateCount / total >= (R?.noDateTasks.ratio ?? 0.6)) nextSteps.push(`为 ${noDateCount} 个任务补充起止日期，便于进度与风险追踪`);
      if (project.status === "进行中" && pendingTasks.length === 0) nextSteps.push("更新项目状态（已无未完成任务）或拆分创建新的具体任务");
      if (nextSteps.length === 0) {
        if (total === 0) nextSteps.push("创建首个任务，让项目进入可跟踪状态");
        else if (project.status === "已完成") nextSteps.push("归档项目或沉淀经验，关闭收尾事项");
        else nextSteps.push("按当前计划推进，定期核对任务进度与截止日期");
      }
    }

    return {
      // 已延期是派生态：用 computeStatus 计算展示状态（项目表只存原始状态）
      project: { name: project.name, status: computeStatus(project), progress, archived: !!project.archived },
      summary,
      completed,
      pending,
      delayed,
      risks,
      pendingAnnotations,
      files,
      nextSteps,
      // V2.0 概览面板：结构化任务列表（带 id + 完整名）供 popover 快速定位
      pendingTaskItems,
      noDateTaskItems,
      // 全量统计（KPI 分母等用；pending/completed 是截断展示版，不能直接当总数）
      stats: {
        total,
        done: doneTasks.length,
        pending: pendingTasks.length,
        delayed: delayed.length,
        pendingAnnotations: pendingAnnotations.length,
        noDate: noDateCount,
      },
    };
  }

  /**
   * 解析周报时间范围（V2.2 R3）：thisWeek / lastWeek / last7days / custom
   * 周起始默认周一（本地时区）；custom 需 startDate + endDate（YYYY-MM-DD，含两端）
   * @param {string} range
   * @param {string} [startDate]
   * @param {string} [endDate]
   * @returns {{start: string, end: string, label: string}}
   */
  function resolveReportRange(range, startDate, endDate) {
    const today = localToday();
    const nowDay = new Date().getDay(); // 0=周日 .. 6=周六
    const toMonday = nowDay === 0 ? -6 : 1 - nowDay;
    if (range === "thisWeek") {
      return { start: addDays(today, toMonday), end: addDays(today, toMonday + 6), label: "本周" };
    }
    if (range === "lastWeek") {
      return { start: addDays(today, toMonday - 7), end: addDays(today, toMonday - 1), label: "上周" };
    }
    if (range === "last7days") {
      return { start: addDays(today, -6), end: today, label: "近 7 天" };
    }
    if (range === "custom") {
      const s = normalizeDate(startDate);
      const e = normalizeDate(endDate);
      if (!s || !e) throw new Error("自定义范围需同时提供 startDate 与 endDate（YYYY-MM-DD）");
      if (e < s) throw new Error("结束日期不能早于开始日期");
      return { start: s, end: e, label: "自定义" };
    }
    throw new Error(`range 仅支持 thisWeek/lastWeek/last7days/custom，收到「${range || ""}」`);
  }

  /**
   * 一键生成周报/阶段总结（V2.2 R3）：按时间范围输出 Markdown
   * 数据源：getProject 任务树 + summarizeProject（延期/风险/nextSteps 纯规则）
   * 口径：完成项按 done_at 落在范围内（非创建时间）；进行中=当前未完成；风险/建议沿用现有规则
   * @param {string} projectId
   * @param {{range?: string, startDate?: string, endDate?: string}} rangeOpts
   * @returns {{markdown: string, range: {label: string, start: string, end: string}}}
   */
  function generateReport(projectId, rangeOpts = {}) {
    const project = getProject(projectId);
    if (!project) throw new Error(`项目 ${projectId} 不存在`);
    const { start, end, label } = resolveReportRange(rangeOpts.range, rangeOpts.startDate, rangeOpts.endDate);

    const all = flattenTaskTree(project.tasks);
    // 完成项：done=true 且 done_at 日期落在 [start, end]（done_at 为本地 ISO，取前 10 位日期比较）
    const doneInRange = all
      .filter((t) => {
        if (!t.done || !t.doneAt) return false;
        const d = String(t.doneAt).slice(0, 10);
        return d >= start && d <= end;
      })
      .sort((a, b) => String(a.doneAt).localeCompare(String(b.doneAt)));
    const pending = all.filter((t) => !t.done);

    const summary = summarizeProject(projectId);
    const risks = summary.risks || [];
    const nextSteps = summary.nextSteps || [];

    const L = [];
    L.push(`# ${project.name} · ${label}周报`);
    L.push("");
    L.push(`- 统计区间：${start} ~ ${end}`);
    L.push(`- 项目状态：${computeStatus(project)}　完成度：${summary.project.progress}%`);
    L.push("");

    L.push(`## 一、完成项（${doneInRange.length}）`);
    if (doneInRange.length === 0) {
      L.push("");
      L.push("本区间暂无已完成任务。");
    } else {
      L.push("");
      L.push("| 任务 | 负责人 | 完成时间 |");
      L.push("| --- | --- | --- |");
      for (const t of doneInRange) {
        const at = String(t.doneAt).slice(0, 16).replace("T", " ");
        L.push(`| ${t.name} | ${t.assignees?.length ? t.assignees.join("、") : "—"} | ${at} |`);
      }
    }
    L.push("");

    L.push(`## 二、进行中（${pending.length}）`);
    if (pending.length === 0) {
      L.push("");
      L.push("当前没有进行中的任务。");
    } else {
      L.push("");
      L.push("| 任务 | 负责人 | 截止 |");
      L.push("| --- | --- | --- |");
      for (const t of pending) L.push(`| ${t.name} | ${t.assignees?.length ? t.assignees.join("、") : "—"} | ${t.endDate || "—"} |`);
    }
    L.push("");

    L.push("## 三、风险");
    if (risks.length === 0) {
      L.push("");
      L.push("暂无风险。");
    } else {
      L.push("");
      const icon = { high: "🔴", medium: "🟡", low: "⚪" };
      const label = { high: "高", medium: "中", low: "低" };
      for (const r of risks) L.push(`- ${icon[r.level] || "•"} [${label[r.level] || r.level}] ${r.desc}`);
    }
    L.push("");

    L.push("## 四、下周建议");
    if (nextSteps.length === 0) {
      L.push("");
      L.push("按当前计划推进，定期核对任务进度与截止日期。");
    } else {
      L.push("");
      nextSteps.forEach((n, i) => L.push(`${i + 1}. ${n}`));
    }

    return { markdown: L.join("\n"), range: { label, start, end } };
  }

  // ===== 项目级问答编排（V2.0 S11）=====

  // askProject 的 scope 白名单
  const ASK_SCOPES = ["summary", "risks", "decisions", "timeline", "files", "requirements", "plans", "all"];

  /**
   * created_at 归一化为毫秒时间戳（跨格式可排序）
   * 纯日期 YYYY-MM-DD（notes）按本地午夜解析；ISO（tasks/annotations/project_summaries）直接解析
   * 与 S10 localToday 的本地时区语义保持一致（避免 UTC 跨日偏差）
   * @param {*} s
   * @returns {number}
   */
  function timeToMillis(s) {
    const str = String(s ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T00:00:00`).getTime();
    return Date.parse(str) || 0;
  }

  /**
   * 批注/备注内容 → 时间线标题（去 HTML、截断防刷屏）
   */
  function timelineTitle(content) {
    return htmlToPlain(content);
  }

  /**
   * 总结 content（JSON 字符串）→ 一句话标题（解析失败兜底「项目总结」）
   */
  function summaryTitle(content) {
    try {
      const j = JSON.parse(content);
      const s = j && typeof j.summary === "string" ? j.summary : "";
      if (s.trim()) return s;
    } catch {}
    return "项目总结";
  }

  /**
   * 收集项目全部 decision 类型批注（V2.0 S11）
   * JOIN tasks 一次取回任务名，避免逐任务查询；按 created_at 正序
   * @param {string} projectId
   * @returns {Array<{id:string, taskId:string, taskName:string, content:string, confirmed:boolean, createdAt:string}>}
   */
  function collectDecisions(projectId) {
    return db.prepare(`
      SELECT a.id, a.task_id, a.content, a.created_at, a.confirmed, t.name AS task_name
      FROM annotations a
      JOIN tasks t ON t.id = a.task_id
      WHERE t.project_id = ? AND a.kind = 'decision'
      ORDER BY a.created_at ASC
    `).all(projectId).map((r) => ({
      id: r.id,
      taskId: r.task_id,
      taskName: r.task_name,
      content: r.content,
      confirmed: !!r.confirmed,
      createdAt: r.created_at,
    }));
  }

  /**
   * 收集项目时间线（V2.0 S11）：任务创建 / 批注 / 备注 / 总结 合并排序
   * 按 created_at 升序（纯日期按本地午夜归一化），同刻按 id 兜底保证稳定；限前 N 条
   * @param {string} projectId
   * @param {number} [limit] 条数上限（默认 30）
   * @returns {Array<{type:string, id:string, title:string, createdAt:string, ...}>}
   */
  function collectTimeline(projectId, limit = 30) {
    const events = [];
    // 任务创建
    for (const t of db.prepare("SELECT id, name, created_at FROM tasks WHERE project_id = ?").all(projectId)) {
      events.push({ type: "task", id: t.id, title: t.name, createdAt: t.created_at });
    }
    // 批注（带任务名，kind 标注）
    for (const a of db.prepare(`
      SELECT a.id, a.content, a.created_at, a.kind, t.name AS task_name
      FROM annotations a
      JOIN tasks t ON t.id = a.task_id
      WHERE t.project_id = ?
    `).all(projectId)) {
      events.push({
        type: "annotation", id: a.id, kind: a.kind || "note",
        title: timelineTitle(a.content), taskName: a.task_name, createdAt: a.created_at,
      });
    }
    // 备注
    for (const n of db.prepare("SELECT id, content, created_at FROM notes WHERE project_id = ?").all(projectId)) {
      events.push({ type: "note", id: n.id, title: timelineTitle(n.content), createdAt: n.created_at });
    }
    // 总结（解析 JSON 取一句话，source 标注）
    for (const s of db.prepare("SELECT id, content, created_at, source FROM project_summaries WHERE project_id = ?").all(projectId)) {
      events.push({
        type: "summary", id: s.id, title: summaryTitle(s.content),
        source: s.source || "manual", createdAt: s.created_at,
      });
    }
    events.sort((a, b) => {
      const t = timeToMillis(a.createdAt) - timeToMillis(b.createdAt);
      return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
    });
    return events.slice(0, limit);
  }

  /**
   * 收集需求列表（scope=requirements）：名称/状态/优先级/关联方案数
   * 复用 listRequirements 的关联方案数统计，map 精简字段（避免返回 description/planIds 冗余）
   * @param {string} projectId
   * @returns {Array<{id:string, name:string, status:string, priority:string, planCount:number}>}
   */
  function collectRequirements(projectId) {
    return listRequirements(projectId).items.map((r) => ({
      id: r.id, name: r.name, status: r.status, priority: r.priority, planCount: r.planCount,
    }));
  }

  /**
   * 收集方案列表（scope=plans）：标题/状态/已转任务标记（taskId 非空即已转任务）
   * @param {string} projectId
   * @returns {Array<{id:string, title:string, status:string, taskId:string|null}>}
   */
  function collectPlans(projectId) {
    return listPlans(projectId).items.map((p) => ({
      id: p.id, title: p.title, status: p.status, taskId: p.taskId || null,
    }));
  }

  /**
   * 项目级问答编排（V2.0 S11）：按 scope 返回项目结构化信息
   * - summary：复用 summarizeProject 完整总结
   * - risks：仅 summarizeProject 的 risks 数组
   * - decisions：全部 decision 类型批注（含任务名/内容/时间）
   * - timeline：时间线（任务创建/批注/备注/总结合并，前 N 条）
   * - files：文件资产清单（复用 getProject().files）
   * - requirements：需求列表（名称/状态/优先级/关联方案数）
   * - plans：方案列表（标题/状态/已转任务标记）
   * - all：以上合并为 { summary, decisions, timeline, files, requirements, plans }
   * @param {string} projectId
   * @param {string} [scope] 默认 all；非法 scope 抛错
   * @returns {object} 各 scope 对应字段；项目不存在抛错
   */
  function askProject(projectId, scope = "all") {
    if (!ASK_SCOPES.includes(scope)) {
      throw new Error(`scope 仅支持 ${ASK_SCOPES.join("/")}，收到「${scope}」`);
    }
    // 统一前置校验：项目不存在直接抛错（summary/risks/files 分支不再判 null）
    const proj = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);

    const wantAll = scope === "all";
    const out = { projectId };
    if (wantAll || scope === "summary") out.summary = summarizeProject(projectId);
    // risks 仅在 scope=risks 时顶层返回（all 时已包含在 summary.risks，不重复）
    if (scope === "risks") out.risks = summarizeProject(projectId).risks;
    if (wantAll || scope === "decisions") out.decisions = collectDecisions(projectId);
    if (wantAll || scope === "timeline") out.timeline = collectTimeline(projectId, 30);
    if (wantAll || scope === "files") out.files = getProject(projectId).files;
    if (wantAll || scope === "requirements") out.requirements = collectRequirements(projectId);
    if (wantAll || scope === "plans") out.plans = collectPlans(projectId);
    return out;
  }

  /**
   * 列出项目审计日志（V2.1 审计追踪）
   * 按 created_at 倒序分页；支持 action / targetType / keyword 筛选（可选）
   * @param {string} projectId
   * @param {object} [opts] { limit?: number, offset?: number, action?: string, targetType?: string, keyword?: string }
   * @returns {{ total: number, items: Array<{id, projectId, action, targetType, targetId, oldValue, newValue, createdAt}> }}
   */
  function listAuditLogs(projectId, opts = {}) {
    const proj = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    // limit：默认 50，上限 200；offset：默认 0；非法值回退默认（与 summaries 路由 P1-1 策略一致）
    const limit = Number.isInteger(opts.limit) && opts.limit >= 1 ? Math.min(opts.limit, 200) : 50;
    const offset = Number.isInteger(opts.offset) && opts.offset >= 0 ? opts.offset : 0;
    const action = String(opts.action || "").trim();
    const targetType = String(opts.targetType || "").trim();
    const keyword = String(opts.keyword || "").trim();
    const dateFrom = String(opts.dateFrom || "").trim();
    const dateTo = String(opts.dateTo || "").trim();
    const where = ["project_id = ?"];
    const params = [projectId];
    if (action) {
      where.push("action = ?");
      params.push(action);
    }
    if (targetType) {
      where.push("target_type = ?");
      params.push(targetType);
    }
    if (keyword) {
      where.push("(action LIKE ? ESCAPE '\\' OR target_id LIKE ? ESCAPE '\\' OR old_value LIKE ? ESCAPE '\\' OR new_value LIKE ? ESCAPE '\\')");
      const kw = `%${escapeLike(keyword)}%`;
      params.push(kw, kw, kw, kw);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      where.push("created_at >= ?");
      params.push(`${dateFrom}T00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      where.push("created_at <= ?");
      params.push(`${dateTo}T23:59:59.999`);
    }
    const whereSql = where.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE ${whereSql}`).get(...params).c;
    const rows = db.prepare(`
      SELECT id, project_id, action, target_type, target_id, old_value, new_value, created_at
      FROM audit_logs
      WHERE ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    return {
      total,
      // 该项目全部行为类型（去重，供前端筛选下拉）
      actions: db.prepare("SELECT DISTINCT action FROM audit_logs WHERE project_id = ? ORDER BY action").all(projectId).map((r) => r.action),
      items: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        oldValue: r.old_value,
        newValue: r.new_value,
        createdAt: r.created_at,
      })),
    };
  }

  return {
    computeStatus,
    // Project Sets
    listProjectSets,
    getProjectSet,
    createProjectSet,
    updateProjectSet,
    deleteProjectSet,
    reorderProjectSets,
    getProjectSetWithProjectCount,
    listProjectSetsWithCounts,
    // Projects
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    // 会话关联（V2.0 S7）
    linkProjectSession,
    listProjectSessions,
    unlinkProjectSession,
    // 项目总结持久化（V2.0 S8）
    saveProjectSummary,
    getProjectSummaries,
    // 项目总结与风险识别（V2.0 S10）
    summarizeProject,
    // 一键周报/阶段总结（V2.2 R3）
    generateReport,
    // 项目级风险规则配置（V2.1）
    getRiskConfig,
    updateRiskConfig,
    // 项目级问答编排（V2.0 S11）
    askProject,
    // 审计日志（V2.1 审计追踪）
    listAuditLogs,
    // Tasks
    listTasks,
    getTaskById,
    createTask,
    createTasks,
    updateTask,
    updateTasks,
    deleteTask,
    reorderTasks,
    reorderSubtasks,
    moveTask,
    // Files
    addFile,
    getFile,
    listFiles,
    moveFile,
    deleteFile,
    getFilePath,
    // Folders（V2.1.4 文件系统重构）
    createFolder,
    updateFolder,
    deleteFolder,
    getFolder,
    listFolders,
    // Notes
    createNote,
    updateNote,
    deleteNote,
    // Quick Tasks（临时任务）
    listQuickTasks,
    createQuickTask,
    updateQuickTask,
    deleteQuickTask,
    archiveQuickTask,
    archiveQuickTasks,
    listArchivedQuickTasks,
    deleteArchivedQuickTasks,
    convertQuickTask,
    // Sub Tasks（兼容旧 API）
    createSubTask,
    updateSubTask,
    deleteSubTask,
    // Annotations（内部用 + routes 调用）
    getTaskAnnotations,
    getProjectAnnotations,
    createAnnotation,
    createAnnotations,
    updateAnnotation,
    deleteAnnotation,
    deleteAnnotations,
    confirmAnnotations,
    updateAnnotations,
    // 直接暴露 db（极少数需要）
    _db: db,
    // 图片上传
    saveUploadedFile,
    // 日历任务
    listCalendarTasks,
    // Members（V2.0 成员管理）
    listMembers,
    createMember,
    renameMember,
    deleteMember,
    allKnownNames,
    // Plans（V2.1 方案管理）
    listPlans,
    getPlan,
    createPlan,
    updatePlan,
    deletePlan,
    addPlanComment,
    deletePlanComment,
    convertPlanToTask,
    // 需求管理（V2.1.3）
    getRequirement,
    createRequirement,
    updateRequirement,
    updateRequirementStatus,
    deleteRequirement,
    listRequirements,
    linkRequirementPlans,
    unlinkRequirementPlans,
    // 统一评论（V2.6，需求/方案共用）
    getComments,
    addComment,
    updateComment,
    deleteComment,
    // 版本管理（V2.6，需求/方案共用）
    listVersions,
    restoreVersion,
    setVersionLabel,
    // 消息中心（V2.3 R1）
    scanMessages,
    listMessages,
    markMessageRead,
    deleteMessage,
    getMessageUnreadCount,
    // 设置 / 消息提醒配置（V2.3 精修 #7）
    getSetting,
    setSetting,
    getMessageConfig,
    updateMessageConfig,
    // 全文检索（V2.3 R2）
    markFtsDirty,
    rebuildFtsIndex,
    ensureFtsReady,
    searchAll,
  };
}