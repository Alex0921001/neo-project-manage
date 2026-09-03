// 项目总结与风险识别（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createInsightsModule(ctx) {
  const { db, escapeLike, htmlToPlain, normalizeDate, localToday, addDays, diffDays, computeStatus } = ctx;
  const logAudit = (...a) => ctx.logAudit(...a);
  const getProject = (...a) => ctx.getProject(...a);
  const listPlans = (...a) => ctx.listPlans(...a);
  const listRequirements = (...a) => ctx.listRequirements(...a);
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

  /**
   * 富文本/HTML → 纯文本（去标签、压缩空白）
   * @param {*} s
   * @returns {string}
   */

  /**
   * 本地日期 YYYY-MM-DD（勿用 toISOString：UTC 可能跨日）
   * @returns {string}
   */

  /**
   * 当前本地时间 ISO 字符串（YYYY-MM-DDTHH:mm:ss，无时区后缀，代表本地时间）
   * 与 localToday 的本地时区语义一致；done_at 落库用（toISOString 是 UTC，会跨日偏差）
   */

  /**
   * YYYY-MM-DD 日期加减 N 天（返回 YYYY-MM-DD）
   * @param {string} d
   * @param {number} days
   * @returns {string}
   */

  /**
   * 两个 YYYY-MM-DD 的差值天数（a - b；UTC 显式解析避免时区/夏令时偏移）
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */

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
    getRiskConfig,
    updateRiskConfig,
    flattenTaskTree,
    summarizeProject,
    resolveReportRange,
    generateReport,
    timeToMillis,
    timelineTitle,
    summaryTitle,
    collectDecisions,
    collectTimeline,
    collectRequirements,
    collectPlans,
    askProject,
    listAuditLogs,
  };
}
