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

  // ===== 内部：组装任务树（按 parent_task_id）=====

  /**
   * 把扁平任务数组按 parent_task_id 组装成树（顶层 → children）
   * 同时挂上 fileRefs / annotations / subtasks
   */
  function buildTaskTree(flatTasks, fileRefsMap, annotationsMap) {
    const byId = new Map();
    // 先创建节点（含 fileRefs / annotations）；snake_case 新字段排除，统一输出 camelCase（P2-6）
    for (const t of flatTasks) {
      const { start_date, end_date, assignees, ...rest } = t;
      byId.set(t.id, {
        ...rest,
        assignees: parseAssignees(assignees),
        startDate: start_date || "",
        endDate: end_date || "",
        done: !!t.done,
        fileRefs: fileRefsMap.get(t.id) || [],
        annotations: annotationsMap.get(t.id) || [],
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
      SELECT id, project_id, parent_task_id, index_num, name, description, done, assignees, start_date, end_date, priority, created_at
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
    const tasks = buildTaskTree(flatTasks, fileRefsMap, annotationsMap);

    const files = db.prepare(`
      SELECT id, name, path, size, ext, indexed, digest, uploaded_at FROM files WHERE project_id = ? ORDER BY uploaded_at DESC
    `).all(id).map((f) => ({
      id: f.id, name: f.name, path: f.path,
      size: f.size ?? null, ext: f.ext ?? null, indexed: f.indexed ?? 0, digest: f.digest ?? null,
      uploadedAt: f.uploaded_at,
    }));

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
      notes,
    };
    // 已延期是展示态，只由前端 computeDisplayStatus 计算，接口返回原始状态
    return project;
  }

  /**
   * 计算项目统计（taskCount / incompleteTaskCount / fileCount / noteCount）
   */
  function getProjectStats(projectId) {
    const taskCount = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE project_id = ?").get(projectId).c;
    const incompleteTaskCount = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND done = 0"
    ).get(projectId).c;
    const fileCount = db.prepare("SELECT COUNT(*) as c FROM files WHERE project_id = ?").get(projectId).c;
    const noteCount = db.prepare("SELECT COUNT(*) as c FROM notes WHERE project_id = ?").get(projectId).c;
    return { taskCount, incompleteTaskCount, fileCount, noteCount };
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
    }
    return getProjectSet(id);
  }

  function deleteProjectSet(id) {
    // 兼容旧检查：集下有项目则报错
    const projCount = db.prepare("SELECT COUNT(*) as c FROM projects WHERE project_set_id = ?").get(id).c;
    if (projCount > 0) throw new Error("项目集下还有项目，无法删除");
    db.prepare("DELETE FROM project_sets WHERE id = ?").run(id);
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
   * 列出项目（可按项目集筛选 / 按名称模糊匹配）
   * @param {string|undefined} projectSetId 项目集 ID（undefined=全部，空字符串=未归类）
   * @param {string|undefined} keyword 按项目名模糊匹配（可选）
   */
  function listProjects(projectSetId, keyword) {
    const where = [];
    const params = [];
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
      return { ...project, ...stats };
    });
  }

  function getProject(id) {
    const full = getProjectFull(id);
    if (!full) return null;
    const stats = getProjectStats(id);
    return { ...full, ...stats };
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
    for (const key of allowed) {
      if (data[key] !== undefined) {
        if (key === "status") {
          // P2-6：status 值域白名单（防直连 REST 写入任意字符串）
          if (!VALID_STATUS.includes(data[key])) throw new Error("项目状态不合法");
          sets[key] = data[key];
        } else if (key === "archived") {
          // 归档/取消归档：联动 archived_at 时间戳
          sets.archived = data.archived ? 1 : 0;
          sets.archivedAt = data.archived ? new Date().toISOString() : null;
        } else if (key === "pinned") {
          // 收藏/取消收藏：0/1 落库（收藏不改变项目状态与分组）
          sets.pinned = data.pinned ? 1 : 0;
        } else if (key === "members") {
          // P2-2/3：成员数组校验 + trim 去重
          sets[key] = normalizeMembers(data[key]);
        } else if (key === "description") {
          // 描述统一清洗（P0-1：防存储型 XSS）
          sets[key] = sanitizeHtml(data[key]);
        } else {
          sets[key] = data[key];
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
    return getProjectFull(id);
  }

  function deleteProject(id) {
    // 检查：递归所有任务（含后代），任意已完成则拒绝
    const allTasks = getProjectTasks(id);
    const doneCount = allTasks.filter((t) => t.done).length;
    if (doneCount > 0) {
      throw new Error(`项目下还有 ${doneCount} 个已完成任务，无法删除`);
    }
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
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
      assignees: parseAssignees(row.assignees),
      startDate: row.start_date || "",
      endDate: row.end_date || "",
      priority: row.priority || "P3",
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
    return task;
  }

  function listTasks(projectId, filters = {}) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const status = filters.status || "all";
    const assignee = (filters.assignee || "").trim();
    const keyword = (filters.keyword || "").trim();
    const dateRange = filters.dateRange || "";
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
      SELECT ${distinct}t.id, t.project_id, t.parent_task_id, t.index_num, t.name, t.description, t.done, t.assignees, t.start_date, t.end_date, t.priority, t.created_at
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
    return rows.map(taskRowToObject).sort((a, b) => {
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

  function createTask(projectId, data) {
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
      created_at: new Date().toISOString(),
    };

    const insertTask = db.prepare(`
      INSERT INTO tasks (id, project_id, parent_task_id, index_num, name, description, done, assignees, start_date, end_date, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `);
    const insertFileRef = db.prepare("INSERT OR IGNORE INTO task_file_refs (task_id, file_id) VALUES (?, ?)");

    db.transaction(() => {
      insertTask.run(task.id, task.project_id, task.parent_task_id, task.index_num, task.name, task.description, task.assignees, task.start_date, task.end_date, task.priority, task.created_at);
      for (const fid of (data.fileRefs || [])) {
        insertFileRef.run(task.id, fid);
      }
    })();

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
      // v1.3.1：父任务仍为完成时不能激活子任务（未完成状态只能从父任务向下同步）
      if (!data.done && cur.parent_task_id) {
        const parent = db.prepare("SELECT id, name, done FROM tasks WHERE id = ? AND project_id = ?").get(cur.parent_task_id, projectId);
        if (parent && parent.done) {
          throw new Error(`无法激活子任务：父任务「${parent.name}」尚未激活，请先激活父任务`);
        }
      }
      sets.push("done = ?"); params.push(data.done ? 1 : 0);
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
    if (data.fileRefs !== undefined) {
      // 替换文件引用集
      const updateFileRefs = db.transaction(() => {
        db.prepare("DELETE FROM task_file_refs WHERE task_id = ?").run(taskId);
        const ins = db.prepare("INSERT OR IGNORE INTO task_file_refs (task_id, file_id) VALUES (?, ?)");
        for (const fid of data.fileRefs) ins.run(taskId, fid);
      });
      updateFileRefs();
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
    const result = taskRowToObject(getTaskOrThrow(projectId, taskId));
    if (warnings.length) result.warnings = warnings;
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

  function deleteTask(projectId, taskId) {
    getTaskOrThrow(projectId, taskId); // 验证存在
    // CASCADE 自动删后代
    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
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
    return getProjectFull(projectId)?.tasks || [];
  }

  // ===== Files =====

  // 摘要上限（字）：超出截断，避免登记冗余（V2.0 文件资产化）
  const DIGEST_MAX_LEN = 500;

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
   */
  function addFile(projectId, filePath, digest) {
    if (!filePath || typeof filePath !== "string") throw new Error("缺少文件路径");
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
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
    };
    db.prepare(
      "INSERT INTO files (id, project_id, name, path, size, ext, indexed, digest, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(file.id, file.project_id, file.name, file.path, file.size, file.ext, file.indexed, file.digest, file.uploaded_at);
    return {
      id: file.id, name: file.name, path: file.path,
      size: file.size, ext: file.ext, indexed: 0, digest: file.digest,
      uploadedAt: file.uploaded_at,
    };
  }

  function deleteFile(projectId, fileId) {
    db.prepare("DELETE FROM files WHERE id = ? AND project_id = ?").run(fileId, projectId);
    return true;
  }

  function getFilePath(projectId, fileId) {
    const row = db.prepare("SELECT path FROM files WHERE id = ? AND project_id = ?").get(fileId, projectId);
    return row ? row.path : null;
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
    return { id: note.id, content: note.content, createdAt: note.created_at };
  }

  function updateNote(projectId, noteId, data) {
    const cur = db.prepare("SELECT id FROM notes WHERE id = ? AND project_id = ?").get(noteId, projectId);
    if (!cur) throw new Error(`备注不存在`);
    if (data.content !== undefined) {
      if (noteContentEmpty(data.content)) throw new Error("备注内容不能为空");
      db.prepare("UPDATE notes SET content = ? WHERE id = ?").run(sanitizeHtml(data.content), noteId);
    }
    const after = db.prepare("SELECT id, content, created_at FROM notes WHERE id = ?").get(noteId);
    return { id: after.id, content: after.content, createdAt: after.created_at };
  }

  function deleteNote(projectId, noteId) {
    db.prepare("DELETE FROM notes WHERE id = ? AND project_id = ?").run(noteId, projectId);
    return true;
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
    return {
      id: ann.id, content: ann.content, kind: ann.kind, confirmed: false, confirmedAt: null, createdAt: ann.created_at,
    };
  }

  function updateAnnotation(taskId, annId, data) {
    const cur = db.prepare("SELECT id FROM annotations WHERE id = ? AND task_id = ?").get(annId, taskId);
    if (!cur) throw new Error(`批注 ${annId} 不存在`);
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
    return {
      id: after.id, content: after.content,
      kind: after.kind || "note",
      confirmed: !!after.confirmed, confirmedAt: after.confirmed_at,
      createdAt: after.created_at,
    };
  }

  function deleteAnnotation(projectId, taskId, annId) {
    // 校验任务属于项目
    getTaskOrThrow(projectId, taskId);
    // 校验批注属于任务
    const ann = db.prepare("SELECT id FROM annotations WHERE id = ? AND task_id = ?").get(annId, taskId);
    if (!ann) throw new Error(`批注 ${annId} 不存在`);
    // 真正删除并校验
    const result = db.prepare("DELETE FROM annotations WHERE id = ? AND task_id = ?").run(annId, taskId);
    if (result.changes === 0) throw new Error(`批注 ${annId} 不存在`);
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
      SELECT t.id, t.project_id, t.parent_task_id, t.name, t.done, t.assignees, t.start_date, t.end_date,
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
      projectName: r.project_name,
      projectSetId: r.project_set_id || "",
    }));
  }

  // ===== 项目总结与风险识别（V2.0 S10）=====

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

    const today = localToday();
    const all = flattenTaskTree(project.tasks); // 全部任务节点（含子任务）
    const total = all.length;
    const doneTasks = all.filter((t) => t.done);
    const pendingTasks = all.filter((t) => !t.done);
    const progress = total === 0 ? 0 : Math.round((doneTasks.length / total) * 100);

    // —— 延期 / 逼近截止（endDate 用 YYYY-MM-DD 字符串比较，同日无时区问题）——
    const delayed = pendingTasks
      .filter((t) => t.endDate && t.endDate < today)
      .map((t) => ({ id: t.id, task: truncateText(t.name), name: t.name, days: diffDays(today, t.endDate) }))
      .sort((a, b) => b.days - a.days);
    const nearDeadline = pendingTasks.filter((t) => {
      if (!t.endDate) return false;
      const d = diffDays(t.endDate, today);
      return d >= 0 && d <= 3; // 含今天，3 天内到期
    });

    // —— 待确认批注（kind 随批注类型，S3）——
    const pendingAnnotations = [];
    for (const t of all) {
      for (const a of t.annotations || []) {
        if (!a.confirmed) {
          pendingAnnotations.push({
            taskId: t.id,
            task: truncateText(t.name),
            name: t.name,
            content: truncateText(htmlToPlain(a.content), 50),
            createdAt: a.createdAt,
            kind: a.kind || "note",
          });
        }
      }
    }
    pendingAnnotations.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    // —— 风险识别（需求 2.1 节 6 条规则，纯计算）——
    const risks = [];
    const overdueProject = project.status !== "已完成" && !!project.planEnd && project.planEnd < today;
    const noDateTasks = all.filter((t) => !t.startDate && !t.endDate);
    const noDateCount = noDateTasks.length;

    // 1. 延期 high：任务 endDate < 今天 且 未完成
    if (delayed.length > 0) {
      risks.push({ level: "high", desc: `${delayed.length} 个任务已延期（最长延期 ${delayed[0].days} 天）`, tasks: delayed.map((t) => ({ id: t.id, name: t.name })) });
    }
    // 2. 逼近截止 medium：任务 endDate 在 3 天内 且 未完成
    if (nearDeadline.length > 0) {
      risks.push({ level: "medium", desc: `${nearDeadline.length} 个任务将在 3 天内到期`, tasks: nearDeadline.map((t) => ({ id: t.id, name: t.name })) });
    }
    // 3. 批注积压 medium：待确认批注 ≥ 3
    if (pendingAnnotations.length >= 3) {
      // 关联任务去重：同一任务多条批注只列一次
      const uniq = [];
      const seen = new Set();
      for (const a of pendingAnnotations) {
        if (!seen.has(a.taskId)) {
          seen.add(a.taskId);
          uniq.push({ id: a.taskId, name: a.name });
        }
      }
      risks.push({ level: "medium", desc: `${pendingAnnotations.length} 条待确认批注待处理`, tasks: uniq });
    }
    // 4. 项目逾期 high：项目 planEnd < 今天 且 未完成
    if (overdueProject) {
      risks.push({ level: "high", desc: `项目已超过计划结束日期（${project.planEnd}）`, tasks: [] });
    }
    // 5. 任务无日期 low：任务数 ≥ 3 且无日期任务 ≥ 60%
    if (total >= 3 && noDateCount / total >= 0.6) {
      risks.push({ level: "low", desc: `${noDateCount}/${total} 个任务缺少起止日期`, tasks: noDateTasks.map((t) => ({ id: t.id, name: t.name })) });
    }
    // 6. 项目停滞 medium：状态「进行中」但 0 个未完成任务
    if (project.status === "进行中" && pendingTasks.length === 0) {
      risks.push({ level: "medium", desc: "项目状态为「进行中」但没有未完成任务", tasks: [] });
    }
    // 按等级排序 high → medium → low
    const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

    // —— 完成/未完成关键项（限前 10，防刷屏；展示用字符串数组，兼容 tools）——
    const MAX_ITEMS = 10;
    const completed = doneTasks.map((t) => truncateText(t.name)).slice(0, MAX_ITEMS);
    const pending = pendingTasks.map((t) => truncateText(t.name)).slice(0, MAX_ITEMS);

    // —— 概览面板结构化任务列表（带 id，供 popover 快速定位；全量不截断）——
    const pendingTaskItems = pendingTasks.map((t) => ({ id: t.id, name: t.name }));
    const noDateTaskItems = noDateTasks.map((t) => ({ id: t.id, name: t.name }));

    // —— 文件资产（全量清单，名称截断）——
    const files = (project.files || []).map((f) => ({
      name: truncateText(f.name, 40),
      ext: f.ext || "",
      size: f.size ?? 0,
      digest: f.digest ? truncateText(htmlToPlain(f.digest), 60) : "",
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
      if (pendingAnnotations.length >= 3) summary += `，${pendingAnnotations.length} 条待确认批注`;
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
      if (pendingAnnotations.length >= 3) nextSteps.push(`处理 ${pendingAnnotations.length} 条待确认批注`);
      if (total >= 3 && noDateCount / total >= 0.6) nextSteps.push(`为 ${noDateCount} 个任务补充起止日期，便于进度与风险追踪`);
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

  // ===== 项目级问答编排（V2.0 S11）=====

  // askProject 的 scope 白名单
  const ASK_SCOPES = ["summary", "risks", "decisions", "timeline", "files", "all"];

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
    return truncateText(htmlToPlain(content), 40);
  }

  /**
   * 总结 content（JSON 字符串）→ 一句话标题（解析失败兜底「项目总结」）
   */
  function summaryTitle(content) {
    try {
      const j = JSON.parse(content);
      const s = j && typeof j.summary === "string" ? j.summary : "";
      if (s.trim()) return truncateText(s, 40);
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
      events.push({ type: "task", id: t.id, title: truncateText(t.name, 40), createdAt: t.created_at });
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
   * 项目级问答编排（V2.0 S11）：按 scope 返回项目结构化信息
   * - summary：复用 summarizeProject 完整总结
   * - risks：仅 summarizeProject 的 risks 数组
   * - decisions：全部 decision 类型批注（含任务名/内容/时间）
   * - timeline：时间线（任务创建/批注/备注/总结合并，前 N 条）
   * - files：文件资产清单（复用 getProject().files）
   * - all：以上合并为 { summary, decisions, timeline, files }
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
    return out;
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
    // 项目级问答编排（V2.0 S11）
    askProject,
    // Tasks
    listTasks,
    getTaskById,
    createTask,
    createTasks,
    updateTask,
    deleteTask,
    reorderTasks,
    reorderSubtasks,
    moveTask,
    // Files
    addFile,
    deleteFile,
    getFilePath,
    // Notes
    createNote,
    updateNote,
    deleteNote,
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
    // 直接暴露 db（极少数需要）
    _db: db,
    // 图片上传
    saveUploadedFile,
    // 日历任务
    listCalendarTasks,
  };
}