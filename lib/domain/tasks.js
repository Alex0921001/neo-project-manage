// Tasks（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createTasksModule(ctx) {
  const { db, shortId, escapeLike, sanitizeHtml, normalizeDate, localToday, localNowIso, addDays, parseAssignees } = ctx;
  const auditText = (...a) => ctx.auditText(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const getTaskPlanRefsMap = (...a) => ctx.getTaskPlanRefsMap(...a);
  const getProjectTasks = (...a) => ctx.getProjectTasks(...a);
  const getProjectFull = (...a) => ctx.getProjectFull(...a);
  const collectDescendantIds = (...a) => ctx.collectDescendantIds(...a);
  const countIncompleteDescendants = (...a) => ctx.countIncompleteDescendants(...a);
  const getTaskAnnotations = (...a) => ctx.getTaskAnnotations(...a);
  const PRIORITY_LEVELS = ["P0", "P1", "P2", "P3", "P4", "P5"];
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

  return {
    getTaskOrThrow,
    taskRowToObject,
    validateTaskDates,
    normalizePriority,
    normalizeMilestone,
    validateTaskName,
    validateAssignees,
    getTaskById,
    listTasks,
    buildTaskObject,
    insertTaskWithRefs,
    createTask,
    updateTask,
    createTasks,
    updateTasks,
    deleteTask,
    reorderTasks,
    reorderSubtasks,
    createSubTask,
    updateSubTask,
    deleteSubTask,
    wouldCreateCycle,
    moveTask,
  };
}
