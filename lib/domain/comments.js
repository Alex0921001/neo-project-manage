// 统一评论（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createCommentsModule(ctx) {
  const { db, shortId, parseAssignees } = ctx;
  const resolveRowById = (...a) => ctx.resolveRowById(...a);
  const auditText = (...a) => ctx.auditText(...a);
  const logAudit = (...a) => ctx.logAudit(...a);
  const markFtsDirty = (...a) => ctx.markFtsDirty(...a);
  const buildTaskObject = (...a) => ctx.buildTaskObject(...a);
  const insertTaskWithRefs = (...a) => ctx.insertTaskWithRefs(...a);
  const getPlanRowOrThrow = (...a) => ctx.getPlanRowOrThrow(...a);
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

  /** 项目级评论列表（可选按 targetType 过滤）：Agent 工具 list_comments 用，支持方案/需求评论一表尽览 */
  function listAllComments(projectId, targetType) {
    const rows = targetType
      ? db.prepare("SELECT * FROM comments WHERE project_id = ? AND target_type = ? ORDER BY created_at DESC, id").all(projectId, targetType)
      : db.prepare("SELECT * FROM comments WHERE project_id = ? ORDER BY created_at DESC, id").all(projectId);
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

  /**
   * 评论引用标注写入（V2.6 划词引用）：前端包裹好高亮 span 的新 HTML 直接写入正文。
   * 专用于绕过「仅草稿/进行中可编辑内容」的状态冻结——给已采纳方案/已完成需求加引用标注
   * 是评论行为而非内容编辑。仅写入，不校验 diff，不触发版本管理（标注不是内容变更）。
   */
  function applyQuoteAnchor(projectId, commentId, content, cleanup = null) {
    const html = String(content ?? "");
    const row = db.prepare("SELECT * FROM comments WHERE id = ? AND project_id = ?").get(commentId, projectId);
    // 清理模式（V2.6.1）：评论已删除时，凭前端回传的目标归属校验后写入清理后的正文。
    // 解决「删除带引用评论 → anchor 持久化报评论不存在 → 孤儿高亮残留」问题
    let targetType;
    let targetId;
    if (row) {
      targetType = row.target_type;
      targetId = row.target_id;
      if (!targetType || !targetId) throw new Error("该评论未挂载对象，无法写入引用标注");
    } else if (cleanup && COMMENT_TARGET_TYPES.includes(cleanup.targetType) && cleanup.targetId) {
      targetType = cleanup.targetType;
      targetId = cleanup.targetId;
    } else {
      throw new Error(`评论 ${commentId} 不存在`);
    }
    if (targetType === "plan") {
      const cur = getPlanRowOrThrow(projectId, targetId);
      db.prepare("UPDATE plans SET content = ?, updated_at = ? WHERE id = ? AND project_id = ?")
        .run(html, new Date().toISOString(), cur.id, projectId);
    } else {
      const cur = db.prepare("SELECT id FROM requirements WHERE id = ? AND project_id = ?").get(targetId, projectId);
      if (!cur) throw new Error(`需求 ${targetId} 不存在`);
      db.prepare("UPDATE requirements SET description = ? WHERE id = ? AND project_id = ?")
        .run(html, cur.id, projectId);
    }
    logAudit(projectId, row ? "评论引用标注" : "清理引用标注", "comment", commentId,
      null, JSON.stringify({ targetType, targetId, ...(row ? {} : { cleanup: true }) }));
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

  return {
    commentRowToObject,
    getComments,
    listAllComments,
    addComment,
    updateComment,
    deleteComment,
    applyQuoteAnchor,
    convertPlanToTask,
  };
}
