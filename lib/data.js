/**
 * 数据访问层（SQLite 版）
 *
 * - 替代旧的 JSON 文件存储
 * - 对外 API 保持兼容（listProjects / getProject / createProject 等）
 * - getProject 返回的 task 含嵌套 subtasks 数组（前端无需改动）
 * - 支持树形任务（任意层级，通过 parent_task_id 自引用）
 */
import path from "node:path";
import { createDb, shortId, tx } from "./db.js";

// ===== status 计算（与旧版一致） =====

function computeStatus(project) {
  if (project.status === "已完成") return "已完成";
  const now = Date.now();
  const start = project.planStart ? new Date(project.planStart).getTime() : null;
  const end = project.planEnd ? new Date(project.planEnd).getTime() : null;
  if (project.status === "待开始" && start && now > start) return "已延期";
  if (project.status === "进行中" && end && now > end) return "已延期";
  return project.status || "待开始";
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
    // 先创建节点（含 fileRefs / annotations）
    for (const t of flatTasks) {
      byId.set(t.id, {
        ...t,
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
      SELECT id, task_id, content, confirmed, confirmed_at, created_at
      FROM annotations
      WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
      ORDER BY created_at ASC
    `).all(projectId);
    const map = new Map();
    for (const r of rows) {
      const a = {
        id: r.id,
        content: r.content,
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
      SELECT id, project_id, parent_task_id, index_num, name, description, done, created_at
      FROM tasks
      WHERE project_id = ?
    `).all(projectId);
  }

  /**
   * 取项目完整详情（含树形任务、文件、备注）
   */
  function getProjectFull(id) {
    const row = db.prepare(`
      SELECT id, name, description, members, plan_start, plan_end, status, project_set_id, created_at
      FROM projects WHERE id = ?
    `).get(id);
    if (!row) return null;

    const flatTasks = getProjectTasks(id);
    const fileRefsMap = getTaskFileRefsMap(id);
    const annotationsMap = getTaskAnnotationsMap(id);
    const tasks = buildTaskTree(flatTasks, fileRefsMap, annotationsMap);

    const files = db.prepare(`
      SELECT id, name, path, uploaded_at FROM files WHERE project_id = ? ORDER BY uploaded_at DESC
    `).all(id).map((f) => ({
      id: f.id, name: f.name, path: f.path, uploadedAt: f.uploaded_at,
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
      members: JSON.parse(row.members || "[]"),
      planStart: row.plan_start || "",
      planEnd: row.plan_end || "",
      status: row.status,
      projectSetId: row.project_set_id || "",
      createdAt: row.created_at,
      tasks,
      files,
      notes,
    };
    return { ...project, status: computeStatus(project) };
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
    return db.prepare("SELECT id, name, created_at FROM project_sets ORDER BY name").all()
      .map((s) => ({ id: s.id, name: s.name, createdAt: s.created_at }));
  }

  function getProjectSet(id) {
    const s = db.prepare("SELECT id, name, created_at FROM project_sets WHERE id = ?").get(id);
    return s ? { id: s.id, name: s.name, createdAt: s.created_at } : null;
  }

  function createProjectSet(data) {
    if (!data.name || !data.name.trim()) throw new Error("项目集名称不能为空");
    if (data.name.trim().length > 10) throw new Error("项目集名称最多10个字符");
    const trimmed = data.name.trim();
    const exists = db.prepare("SELECT 1 FROM project_sets WHERE name = ?").get(trimmed);
    if (exists) throw new Error(`项目集名称「${trimmed}」已存在`);
    const set = { id: shortId(), name: data.name, createdAt: new Date().toISOString().slice(0, 10) };
    db.prepare("INSERT INTO project_sets (id, name, created_at) VALUES (?, ?, ?)").run(set.id, set.name, set.createdAt);
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

  function listProjects(projectSetId) {
    let rows;
    if (projectSetId !== undefined) {
      rows = db.prepare(`
        SELECT id, name, description, members, plan_start, plan_end, status, project_set_id, created_at
        FROM projects
        WHERE project_set_id = ?
        ORDER BY created_at DESC
      `).all(projectSetId || "");
    } else {
      rows = db.prepare(`
        SELECT id, name, description, members, plan_start, plan_end, status, project_set_id, created_at
        FROM projects
        ORDER BY created_at DESC
      `).all();
    }
    return rows.map((row) => {
      const project = {
        id: row.id, name: row.name, description: row.description || "",
        members: JSON.parse(row.members || "[]"),
        planStart: row.plan_start || "", planEnd: row.plan_end || "",
        status: row.status, projectSetId: row.project_set_id || "",
        createdAt: row.created_at,
      };
      const stats = getProjectStats(row.id);
      return { ...project, status: computeStatus(project), ...stats };
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
    if (data.description && data.description.length > 50) throw new Error("项目描述最多50个字符");
    const project = {
      id: shortId(),
      name: data.name,
      description: data.description || "",
      members: data.members || [],
      planStart: data.planStart || "",
      planEnd: data.planEnd || "",
      status: data.status || "待开始",
      projectSetId: data.projectSetId || "",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    db.prepare(`
      INSERT INTO projects (id, name, description, members, plan_start, plan_end, status, project_set_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.id, project.name, project.description, JSON.stringify(project.members),
      project.planStart || null, project.planEnd || null,
      project.status, project.projectSetId || null, project.createdAt
    );
    return { ...project, status: computeStatus(project) };
  }

  function updateProject(id, data) {
    const cur = getProjectFull(id);
    if (!cur) return null;
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("项目名称不能为空");
      if (data.name.trim().length > 20) throw new Error("项目名称最多20个字符");
    }
    if (data.description !== undefined && data.description.length > 50) {
      throw new Error("项目描述最多50个字符");
    }
    const allowed = ["name", "description", "members", "planStart", "planEnd", "status", "projectSetId"];
    const sets = {};
    for (const key of allowed) {
      if (data[key] !== undefined) sets[key] = data[key];
    }
    // 拼 UPDATE
    const map = {
      name: "name", description: "description", members: "members",
      planStart: "plan_start", planEnd: "plan_end", status: "status",
      projectSetId: "project_set_id",
    };
    const parts = [];
    const params = [];
    for (const [k, v] of Object.entries(sets)) {
      parts.push(`${map[k]} = ?`);
      params.push(k === "members" ? JSON.stringify(v) : (v || null));
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
      created_at: row.created_at,
    };
  }

  function createTask(projectId, data) {
    // 验证项目存在
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);

    // 验证父任务（如果有）
    let parentTask = null;
    if (data.parentTaskId) {
      parentTask = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(data.parentTaskId, projectId);
      if (!parentTask) throw new Error(`父任务 ${data.parentTaskId} 不存在`);
    }

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
      name: data.name,
      description: data.description || "",
      done: 0,
      created_at: new Date().toISOString(),
    };

    const insertTask = db.prepare(`
      INSERT INTO tasks (id, project_id, parent_task_id, index_num, name, description, done, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);
    const insertFileRef = db.prepare("INSERT OR IGNORE INTO task_file_refs (task_id, file_id) VALUES (?, ?)");

    db.transaction(() => {
      insertTask.run(task.id, task.project_id, task.parent_task_id, task.index_num, task.name, task.description, task.created_at);
      for (const fid of (data.fileRefs || [])) {
        insertFileRef.run(task.id, fid);
      }
    })();

    return taskRowToObject(task);
  }

  function updateTask(projectId, taskId, data) {
    const cur = getTaskOrThrow(projectId, taskId);
    const sets = [];
    const params = [];
    if (data.name !== undefined) { sets.push("name = ?"); params.push(data.name); }
    if (data.description !== undefined) { sets.push("description = ?"); params.push(data.description); }
    if (data.done !== undefined) { sets.push("done = ?"); params.push(data.done ? 1 : 0); }
    if (data.parentTaskId !== undefined) {
      if (data.parentTaskId === null) { sets.push("parent_task_id = ?"); params.push(null); }
      else { sets.push("parent_task_id = ?"); params.push(data.parentTaskId); }
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
    return taskRowToObject(getTaskOrThrow(projectId, taskId));
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

  function addFile(projectId, filePath) {
    if (!filePath || typeof filePath !== "string") throw new Error("缺少文件路径");
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const file = {
      id: shortId(),
      project_id: projectId,
      name,
      path: filePath,
      uploaded_at: new Date().toISOString().slice(0, 10),
    };
    db.prepare(
      "INSERT INTO files (id, project_id, name, path, uploaded_at) VALUES (?, ?, ?, ?, ?)"
    ).run(file.id, file.project_id, file.name, file.path, file.uploaded_at);
    return { id: file.id, name: file.name, path: file.path, uploadedAt: file.uploaded_at };
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

  function createNote(projectId, data) {
    const projExists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!projExists) throw new Error(`项目 ${projectId} 不存在`);
    if (!data.content || !data.content.trim()) throw new Error("备注内容不能为空");
    const note = {
      id: shortId(),
      project_id: projectId,
      content: data.content.trim(),
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
      if (!data.content.trim()) throw new Error("备注内容不能为空");
      db.prepare("UPDATE notes SET content = ? WHERE id = ?").run(data.content.trim(), noteId);
    }
    const after = db.prepare("SELECT id, content, created_at FROM notes WHERE id = ?").get(noteId);
    return { id: after.id, content: after.content, createdAt: after.created_at };
  }

  function deleteNote(projectId, noteId) {
    db.prepare("DELETE FROM notes WHERE id = ? AND project_id = ?").run(noteId, projectId);
    return true;
  }

  // ===== Annotations =====

  function getTaskAnnotations(taskId) {
    return db.prepare(
      "SELECT id, content, confirmed, confirmed_at, created_at FROM annotations WHERE task_id = ? ORDER BY created_at ASC"
    ).all(taskId).map((r) => ({
      id: r.id,
      content: r.content,
      confirmed: !!r.confirmed,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
    }));
  }

  function createAnnotation(taskId, data) {
    if (!data.content || !data.content.trim()) throw new Error("批注内容不能为空");
    const ann = {
      id: shortId(),
      task_id: taskId,
      content: data.content.trim(),
      confirmed: 0,
      confirmed_at: null,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO annotations (id, task_id, content, confirmed, confirmed_at, created_at) VALUES (?, ?, ?, 0, NULL, ?)"
    ).run(ann.id, ann.task_id, ann.content, ann.created_at);
    return {
      id: ann.id, content: ann.content, confirmed: false, confirmedAt: null, createdAt: ann.created_at,
    };
  }

  function updateAnnotation(taskId, annId, data) {
    const cur = db.prepare("SELECT id FROM annotations WHERE id = ? AND task_id = ?").get(annId, taskId);
    if (!cur) throw new Error(`批注 ${annId} 不存在`);
    if (data.content !== undefined) {
      if (!data.content.trim()) throw new Error("批注内容不能为空");
      db.prepare("UPDATE annotations SET content = ? WHERE id = ?").run(data.content.trim(), annId);
    }
    if (data.confirmed !== undefined) {
      const confirmed = data.confirmed ? 1 : 0;
      const confirmedAt = data.confirmed ? new Date().toISOString() : null;
      db.prepare("UPDATE annotations SET confirmed = ?, confirmed_at = ? WHERE id = ?").run(confirmed, confirmedAt, annId);
    }
    const after = db.prepare("SELECT id, content, confirmed, confirmed_at, created_at FROM annotations WHERE id = ?").get(annId);
    return {
      id: after.id, content: after.content,
      confirmed: !!after.confirmed, confirmedAt: after.confirmed_at,
      createdAt: after.created_at,
    };
  }

  function deleteAnnotation(taskId, annId) {
    db.prepare("DELETE FROM annotations WHERE id = ? AND task_id = ?").run(annId, taskId);
    return true;
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

  return {
    computeStatus,
    // Project Sets
    listProjectSets,
    getProjectSet,
    createProjectSet,
    updateProjectSet,
    deleteProjectSet,
    getProjectSetWithProjectCount,
    listProjectSetsWithCounts,
    // Projects
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    // Tasks
    createTask,
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
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    // 直接暴露 db（极少数需要）
    _db: db,
  };
}