/**
 * 数据访问层（SQLite 版）
 *
 * - 替代旧的 JSON 文件存储
 * - 对外 API 保持兼容（listProjects / getProject / createProject 等）
 * - getProject 返回的 task 含嵌套 subtasks 数组（前端无需改动）
 * - 支持树形任务（任意层级，通过 parent_task_id 自引用）
 */
import { createSettingsModule } from "./domain/settings.js";
import { createMessagesModule } from "./domain/messages.js";
import { createMembersModule } from "./domain/members.js";
import { createNotesModule } from "./domain/notes.js";
import { createQuickTasksModule } from "./domain/quick-tasks.js";
import { createSessionsModule } from "./domain/sessions.js";
import { createCalendarModule } from "./domain/calendar.js";
import { createUploadsModule } from "./domain/uploads.js";
import path from "node:path";
import fs from "node:fs";
import { createDb, shortId, tx } from "./db.js";
import { sanitizeHtml, richTextEmpty } from "./sanitize.js";
import { createCoreModule } from "./domain/core.js";
import { createFtsModule } from "./domain/fts.js";
import { createAuditModule } from "./domain/audit.js";
import { createProjectSetsModule } from "./domain/project-sets.js";
import { createTasksModule } from "./domain/tasks.js";
import { createAnnotationsModule } from "./domain/annotations.js";
import { createProjectsModule } from "./domain/projects.js";
import { createFilesModule } from "./domain/files.js";
import { createPlansModule } from "./domain/plans.js";
import { createVersionsModule } from "./domain/versions.js";
import { createVerificationsModule } from "./domain/verifications.js";
import { createCommentsModule } from "./domain/comments.js";
import { createRequirementsModule } from "./domain/requirements.js";
import { createInsightsModule } from "./domain/insights.js";

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
  // ===== V2.6.1 批2拆分：模块组装（顺序 assign；跨模块依赖走转发箭头，顺序仅影响可读性）=====
  const ctx = { db, shortId, escapeLike, htmlToPlain, truncateText, sanitizeHtml, richTextEmpty, normalizeDate, localToday, localNowIso, addDays, diffDays, parseAssignees, parseMembers, parseSessionIds, computeStatus, normalizeMembers, buildTaskTree, getTaskPlanRefsMap, getTaskFileRefsMap, getTaskAnnotationsMap, getProjectTasks, getProjectFull, getProjectStats, collectDescendantIds, countIncompleteDescendants };
  // ===== 共享工具（剥离自各区块，闭包内提升）=====
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

  function htmlToPlain(s) {
    return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function truncateText(s, max = 30) {
    const t = String(s ?? "").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }

  function localToday() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function localNowIso() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function addDays(d, days) {
    const [y, m, dd] = String(d).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    dt.setUTCDate(dt.getUTCDate() + days);
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
  }

  function diffDays(a, b) {
    const DAY_MS = 86400000;
    return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
  }

  Object.assign(ctx, createCoreModule(ctx));
  Object.assign(ctx, createFtsModule(ctx));
  Object.assign(ctx, createAuditModule(ctx));
  Object.assign(ctx, createSettingsModule(ctx), createMessagesModule(ctx), createMembersModule(ctx), createNotesModule(ctx), createQuickTasksModule(ctx), createSessionsModule(ctx), createCalendarModule(ctx), createUploadsModule(ctx));
  Object.assign(ctx, createProjectSetsModule(ctx), createTasksModule(ctx), createAnnotationsModule(ctx), createProjectsModule(ctx), createFilesModule(ctx), createPlansModule(ctx), createVersionsModule(ctx), createVerificationsModule(ctx), createCommentsModule(ctx), createRequirementsModule(ctx), createInsightsModule(ctx));
  const { getSetting, setSetting, getMessageConfig, updateMessageConfig, insertMessage, scanMessages, listMessages, markMessageRead, deleteMessage, getMessageUnreadCount, listMembers, normalizeMemberName, createMember, renameMember, deleteMember, allKnownNames, noteContentEmpty, createNote, updateNote, deleteNote, quickNow, quickRow, getQuickTaskRow, syncQuickTaskFts, removeQuickTaskFts, listQuickTasks, createQuickTask, updateQuickTask, deleteQuickTask, archiveQuickTask, archiveQuickTasks, listArchivedQuickTasks, deleteArchivedQuickTasks, convertQuickTask, getProjectSessionIds, linkProjectSession, listProjectSessions, unlinkProjectSession, listCalendarTasks, matchesMagic, saveUploadedFile, healDanglingReferences, resolveRowById, markFtsDirty, insertFtsEntries, rebuildFtsIndex, ensureFtsReady, toFtsPhrase, ftsSearch, likeSearch, searchAll, ftsFullIndexed, indexedProjectCount, auditText, logAudit, listProjectSets, getProjectSet, createProjectSet, updateProjectSet, deleteProjectSet, reorderProjectSets, getProjectSetWithProjectCount, listProjectSetsWithCounts, getTaskOrThrow, taskRowToObject, validateTaskDates, normalizePriority, normalizeMilestone, validateTaskName, validateAssignees, getTaskById, listTasks, buildTaskObject, insertTaskWithRefs, createTask, updateTask, createTasks, updateTasks, deleteTask, reorderTasks, reorderSubtasks, createSubTask, updateSubTask, deleteSubTask, wouldCreateCycle, moveTask, normalizeAnnotationKind, getTaskAnnotations, getProjectAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, createAnnotations, deleteAnnotations, confirmAnnotations, updateAnnotations, listProjects, getProject, createProject, updateProject, deleteProject, saveProjectSummary, getProjectSummaries, fileRowToObject, readFileMeta, normalizeDigest, addFile, getFile, listFiles, moveFile, deleteFile, getFilePath, folderNameError, assertFolderSameLevelName, getFolderOrThrow, wouldCreateFolderCycle, createFolder, updateFolder, deleteFolder, getFolder, listFolders, planRowToObject, getPlanRowOrThrow, replacePlanRequirements, replacePlanTasks, createPlan, updatePlan, deletePlan, listPlans, getPlan, addPlanComment, deletePlanComment, saveVersion, ensureBaselineVersion, deleteVersionsFor, listVersions, restoreVersion, setVersionLabel, verificationRowToObject, verificationWithMeta, listVerifications, getVerificationRowOrThrow, getVerificationGlobal, normalizeVerificationTaskIds, normalizeVerificationPlanIds, createVerification, updateVerification, deleteVerification, verificationItemRowToObject, listVerificationItems, createVerificationItem, updateVerificationItem, toggleVerificationItem, deleteVerificationItem, seedVerificationCategories, listVerificationCategories, createVerificationCategory, renameVerificationCategory, deleteVerificationCategory, clearVerificationItems, commentRowToObject, getComments, listAllComments, addComment, updateComment, deleteComment, applyQuoteAnchor, convertPlanToTask, requirementRowToObject, getRequirement, replaceRequirementPlans, createRequirement, updateRequirement, updateRequirementStatus, unlinkPlanFromVerifications, deleteRequirement, listRequirements, linkRequirementPlans, unlinkRequirementPlans, getRiskConfig, updateRiskConfig, flattenTaskTree, summarizeProject, resolveReportRange, generateReport, timeToMillis, timelineTitle, summaryTitle, collectDecisions, collectTimeline, collectRequirements, collectPlans, askProject, listAuditLogs } = ctx;

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
    listAllComments,
    addComment,
    updateComment,
    deleteComment,
    applyQuoteAnchor,
    // 版本管理（V2.6，需求/方案共用）
    listVersions,
    restoreVersion,
    setVersionLabel,
    // 验证模块（V2.6.1：验证卡 + 验证项）
    listVerifications,
    getVerificationGlobal,
    createVerification,
    updateVerification,
    deleteVerification,
    listVerificationItems,
    createVerificationItem,
    updateVerificationItem,
    toggleVerificationItem,
    deleteVerificationItem,
    listVerificationCategories,
    createVerificationCategory,
    renameVerificationCategory,
    deleteVerificationCategory,
    clearVerificationItems,
    seedVerificationCategories,
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
