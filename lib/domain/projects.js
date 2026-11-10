// Projects
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import

/** 项目状态白名单：6 个存储态；「已延期」是派生展示态，不落库、不在此列 */
export const PROJECT_STATUSES = ["预开始", "待开始", "进行中", "预结束", "已完成", "已取消"];

export function createProjectsModule(ctx) {
  const { db, shortId, escapeLike, sanitizeHtml, normalizeDate, parseMembers, normalizeMembers } = ctx;
  const resolveRowById = (...a) => ctx.resolveRowById(...a);
  const auditText = (...a) => ctx.auditText(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const getProjectTasks = (...a) => ctx.getProjectTasks(...a);
  const getProjectFull = (...a) => ctx.getProjectFull(...a);
  const getProjectStats = (...a) => ctx.getProjectStats(...a);
  const listPlans = (...a) => ctx.listPlans(...a);
  const seedVerificationCategories = (...a) => ctx.seedVerificationCategories(...a);
  const listRequirements = (...a) => ctx.listRequirements(...a);
  const syncQuickTaskFts = (...a) => ctx.syncQuickTaskFts(...a);
  // ===== Projects =====

  /**
   * 列出项目（可按项目集筛选 / 按名称模糊匹配 / 按状态过滤）
   * @param {string|undefined} projectSetId 项目集 ID（undefined=全部，空字符串=未归类）
   * @param {string|undefined} keyword 按项目名模糊匹配（可选）
   * @param {string|undefined} status 按状态过滤（预开始/待开始/进行中/预结束/已完成/已取消，可选）
   */
  function listProjects(projectSetId, keyword, status) {
    const where = [];
    const params = [];
    if (status) {
      const VALID = PROJECT_STATUSES;
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
 // 卡片信息区需展示前3条任务/方案/需求标题（供 5 行卡片渲染）
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
 // 支持完整 ID 或唯一短前缀全局查询（对齐 get_plan / get_requirement 的 ID 体系）
    const row = resolveRowById("projects", "id", null, null, id, "项目", (r) => r.name);
    if (!row) return null;
    const full = getProjectFull(row.id);
    if (!full) return null;
    const stats = getProjectStats(row.id);
 // 需求/方案清单精简映射（接口约定给 get-project 渲染，字段名不可变）
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
 // 描述：起支持富文本 HTML，不再限制长度（原 200 字符限制已移除）
    // P3-1：项目日期格式校验（复用 normalizeDate 的反向比对，拦截溢出日期）
    normalizeDate(data.planStart);
    normalizeDate(data.planEnd);
    // P2-2：项目计划周期硬校验（与任务 endDate>=startDate 一致）
    if (data.planStart && data.planEnd && data.planEnd < data.planStart) {
      throw new Error("项目结束日期不能早于开始日期");
    }
    // P2-6：create 侧 status 同样白名单校验
    const rawStatus = data.status || "待开始";
    if (!PROJECT_STATUSES.includes(rawStatus)) throw new Error("项目状态不合法");
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
    // 新项目预置验证分类（功能验证/边界与异常/回归验证）
    seedVerificationCategories(project.id);
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
 // 描述：起支持富文本 HTML，不再限制长度（原 200 字符限制已移除）
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
    const VALID_STATUS = PROJECT_STATUSES;
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
 // 审计：对比 cur 与最终值，只记实际变更字段（审计追踪）
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


 // ===== 项目总结持久化） =====

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

  /**
   * 复制项目：以源项目为模板创建新项目，按 data.copy 勾选复制任务/需求/方案/验证/文件/备注。
   * - 任务保留落级、优先级、负责人、日期，完成状态重置为未完成
   * - 需求状态重置为「待处理」，方案状态重置为「草稿」
   * - 验证项勾选状态、证据、勾选人与时间全部重置
   * - 文件物理复制到 <dataDir>/assets/<newProjectId>/，复制失败的文件跳过并在结果中列出
   * @param {string} sourceId 源项目 ID
   * @param {object} data 新项目字段 + copy 选项
   */
  function copyProject(sourceId, data) {
    const src = db.prepare("SELECT id FROM projects WHERE id = ?").get(sourceId);
    if (!src) throw new Error("源项目不存在");

    const name = String(data.name || "").trim();
    if (!name) throw new Error("项目名称不能为空");
    if (name.length > 20) throw new Error("项目名称最多 20 个字符");
    normalizeDate(data.planStart);
    normalizeDate(data.planEnd);
    if (data.planStart && data.planEnd && data.planEnd < data.planStart) {
      throw new Error("项目结束日期不能早于开始日期");
    }
    const rawStatus = data.status || "待开始";
    if (!PROJECT_STATUSES.includes(rawStatus)) throw new Error("项目状态不合法");

    const want = {
      tasks: !!data.copy?.tasks,
      requirements: !!data.copy?.requirements,
      plans: !!data.copy?.plans,
      verifications: !!data.copy?.verifications,
      files: !!data.copy?.files,
      notes: !!data.copy?.notes,
    };

    const newId = shortId();
    const createdAt = new Date().toISOString().slice(0, 10);
    const copied = { tasks: 0, annotations: 0, requirements: 0, plans: 0, verifications: 0, files: 0, notes: 0 };
    const skippedFiles = [];

    const run = db.transaction(() => {
      db.prepare(`
        INSERT INTO projects (id, name, description, members, plan_start, plan_end, status, project_set_id, created_at, pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId, name, sanitizeHtml(data.description), JSON.stringify(normalizeMembers(data.members)),
        data.planStart || null, data.planEnd || null, rawStatus, data.projectSetId || null, createdAt, 0
      );
      seedVerificationCategories(newId);

      // ===== 备注 =====
      if (want.notes) {
        const rows = db.prepare("SELECT content FROM notes WHERE project_id = ? ORDER BY created_at").all(sourceId);
        for (const r of rows) {
          db.prepare("INSERT INTO notes (id, project_id, content, created_at) VALUES (?, ?, ?, ?)")
            .run(shortId(), newId, r.content, createdAt);
        }
        copied.notes = rows.length;
      }

      // ===== 任务（保留层级与属性，完成状态重置）+ 批注随任务 =====
      const taskMap = new Map();
      if (want.tasks) {
        const tasks = db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY index_num, created_at").all(sourceId);
        for (const t of tasks) {
          const nid = shortId();
          taskMap.set(t.id, nid);
          db.prepare(`
            INSERT INTO tasks (id, project_id, parent_task_id, index_num, name, description, done, done_at, assignees, start_date, end_date, priority, is_milestone, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(nid, newId, null, t.index_num, t.name, t.description, 0, null, t.assignees, t.start_date, t.end_date, t.priority, t.is_milestone, createdAt);
        }
        for (const t of tasks) {
          const parent = t.parent_task_id && taskMap.get(t.parent_task_id);
          if (parent) db.prepare("UPDATE tasks SET parent_task_id = ? WHERE id = ?").run(parent, taskMap.get(t.id));
        }
        let annCount = 0;
        for (const t of tasks) {
          const anns = db.prepare("SELECT * FROM annotations WHERE task_id = ? ORDER BY created_at").all(t.id);
          for (const a of anns) {
            db.prepare("INSERT INTO annotations (id, task_id, content, kind, confirmed, confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .run(shortId(), taskMap.get(t.id), a.content, a.kind, a.confirmed, a.confirmed_at, createdAt);
            annCount += 1;
          }
        }
        copied.tasks = tasks.length;
        copied.annotations = annCount;
      }

      // ===== 需求（状态重置为待处理） =====
      const reqMap = new Map();
      if (want.requirements) {
        const rows = db.prepare("SELECT * FROM requirements WHERE project_id = ? ORDER BY created_at").all(sourceId);
        for (const r of rows) {
          const nid = shortId();
          reqMap.set(r.id, nid);
          db.prepare("INSERT INTO requirements (id, project_id, name, description, status, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(nid, newId, r.name, r.description, "待处理", r.priority, createdAt);
        }
        copied.requirements = rows.length;
      }

      // ===== 方案（状态重置为草稿，重建任务/需求关联） =====
      const planMap = new Map();
      if (want.plans) {
        const rows = db.prepare("SELECT * FROM plans WHERE project_id = ? ORDER BY created_at").all(sourceId);
        for (const p of rows) {
          const nid = shortId();
          planMap.set(p.id, nid);
          const linkedTask = p.task_id && taskMap.get(p.task_id);
          db.prepare("INSERT INTO plans (id, project_id, title, content, status, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .run(nid, newId, p.title, p.content, "草稿", linkedTask || null, createdAt, createdAt);
        }
        for (const p of rows) {
          const refs = db.prepare("SELECT task_id FROM task_plans WHERE plan_id = ?").all(p.id);
          for (const ref of refs) {
            const nt = taskMap.get(ref.task_id);
            if (nt) db.prepare("INSERT OR IGNORE INTO task_plans (task_id, plan_id) VALUES (?, ?)").run(nt, planMap.get(p.id));
          }
        }
        for (const p of rows) {
          const refs = db.prepare("SELECT requirement_id FROM requirement_plans WHERE plan_id = ?").all(p.id);
          for (const ref of refs) {
            const nr = reqMap.get(ref.requirement_id);
            if (nr) db.prepare("INSERT OR IGNORE INTO requirement_plans (requirement_id, plan_id) VALUES (?, ?)").run(nr, planMap.get(p.id));
          }
        }
        copied.plans = rows.length;
      }

      // ===== 验证（卡 + 项，勾选状态全部重置） =====
      if (want.verifications) {
        const cards = db.prepare("SELECT * FROM verifications WHERE project_id = ? ORDER BY created_at").all(sourceId);
        for (const v of cards) {
          const nid = shortId();
          let taskIds = [];
          try {
            const arr = JSON.parse(v.task_ids || "[]");
            taskIds = Array.isArray(arr) ? arr.map((id) => taskMap.get(id)).filter(Boolean) : [];
          } catch {
            taskIds = [];
          }
          db.prepare("INSERT INTO verifications (id, project_id, name, note, task_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(nid, newId, v.name, v.note, JSON.stringify(taskIds), createdAt, null);
          const items = db.prepare("SELECT * FROM verification_items WHERE verification_id = ? ORDER BY created_at").all(v.id);
          for (const it of items) {
            db.prepare(`
              INSERT INTO verification_items (id, verification_id, category, content, note, kind, instruction, evidence, status, checked_at, checked_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(shortId(), nid, it.category, it.content, it.note, it.kind, it.instruction, null, 0, null, null, createdAt, null);
          }
        }
        copied.verifications = cards.length;
      }

      // ===== 文件（物理复制到数据目录，与原项目互不影响） =====
      if (want.files) {
        const folderMap = new Map();
        const folders = db.prepare("SELECT * FROM file_folders WHERE project_id = ? ORDER BY created_at").all(sourceId);
        for (const f of folders) {
          const nid = shortId();
          folderMap.set(f.id, nid);
          db.prepare("INSERT INTO file_folders (id, project_id, parent_id, name, created_at) VALUES (?, ?, ?, ?, ?)")
            .run(nid, newId, null, f.name, createdAt);
        }
        for (const f of folders) {
          const parent = f.parent_id && folderMap.get(f.parent_id);
          if (parent) db.prepare("UPDATE file_folders SET parent_id = ? WHERE id = ?").run(parent, folderMap.get(f.id));
        }

        const rows = db.prepare("SELECT * FROM files WHERE project_id = ? ORDER BY uploaded_at").all(sourceId);
        for (const r of rows) {
          // 记录复制：沿用原路径，不复制文件本体（App 沙箱无法读取工作区外文件）
          db.prepare(`
            INSERT INTO files (id, project_id, name, path, size, ext, indexed, digest, uploaded_at, folder_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(shortId(), newId, r.name, r.path, r.size, r.ext, 0, r.digest, createdAt, (r.folder_id && folderMap.get(r.folder_id)) || null);
        }
        copied.files = rows.length;
      }
    });
    run();

    logAudit(newId, "复制项目", "project", newId, null, JSON.stringify({
      sourceId,
      name,
      status: rawStatus,
      copy: want,
      copied,
      skippedFiles,
    }));

    return { project: getProject(newId), copied, skippedFiles };
  }

  return {
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    copyProject,
    saveProjectSummary,
    getProjectSummaries,
  };
}
