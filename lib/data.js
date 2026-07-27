import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PROJECT_SETS_FILE = "project-sets.json";
const PROJECTS_FILE = "projects.json";

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

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
  const setsPath = path.join(dataDir, PROJECT_SETS_FILE);
  const projsPath = path.join(dataDir, PROJECTS_FILE);

  // ---- Project Sets ----

  function listProjectSets() {
    return readJSON(setsPath);
  }

  function getProjectSet(id) {
    const sets = listProjectSets();
    return sets.find((s) => s.id === id) || null;
  }

  function createProjectSet(data) {
    if (!data.name || data.name.trim().length === 0) throw new Error("项目集名称不能为空");
    if (data.name.trim().length > 10) throw new Error("项目集名称最多10个字符");
    const sets = listProjectSets();
    const set = {
      id: uid(),
      name: data.name,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    sets.push(set);
    writeJSON(setsPath, sets);
    return set;
  }

  function updateProjectSet(id, data) {
    const sets = listProjectSets();
    const idx = sets.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("项目集名称不能为空");
      if (data.name.trim().length > 10) throw new Error("项目集名称最多10个字符");
      sets[idx].name = data.name;
    }
    writeJSON(setsPath, sets);
    return sets[idx];
  }

  function deleteProjectSet(id) {
    // Check if any project belongs to this set
    const projects = listProjects();
    if (projects.some((p) => p.projectSetId === id)) {
      throw new Error(`项目集下还有项目，无法删除`);
    }
    const sets = listProjectSets();
    const idx = sets.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    sets.splice(idx, 1);
    writeJSON(setsPath, sets);
    return true;
  }

  function getProjectSetWithProjectCount(id) {
    const set = getProjectSet(id);
    if (!set) return null;
    const projects = listProjects();
    return {
      ...set,
      projectCount: projects.filter((p) => p.projectSetId === id).length,
    };
  }

  function listProjectSetsWithCounts() {
    const sets = listProjectSets();
    const projects = listProjects();
    return sets
      .map((s) => ({
        ...s,
        projectCount: projects.filter((p) => p.projectSetId === s.id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  // ---- Projects ----

  function listProjects(projectSetId) {
    const all = readJSON(projsPath);
    let filtered = all;
    if (projectSetId !== undefined) {
      filtered = all.filter((p) => p.projectSetId === (projectSetId || ""));
    }
    return filtered.map((p) => ({
      ...p,
      status: computeStatus(p),
      taskCount: (p.tasks || []).length,
      incompleteTaskCount: (p.tasks || []).filter((t) => !t.done).length,
      fileCount: (p.files || []).length,
      noteCount: (p.notes || []).length,
    }));
  }

  function getProject(id) {
    const all = readJSON(projsPath);
    const p = all.find((pr) => pr.id === id);
    if (!p) return null;
    return { ...p, status: computeStatus(p) };
  }

  function createProject(data) {
    if (!data.name || data.name.trim().length === 0) throw new Error("项目名称不能为空");
    if (data.name.trim().length > 20) throw new Error("项目名称最多20个字符");
    if (data.description && data.description.length > 50) throw new Error("项目描述最多50个字符");
    const all = listProjects();
    const project = {
      id: uid(),
      name: data.name,
      description: data.description || "",
      members: data.members || [],
      planStart: data.planStart || "",
      planEnd: data.planEnd || "",
      status: data.status || "待开始",
      projectSetId: data.projectSetId || "",
      tasks: [],
      files: [],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    all.push(project);
    writeJSON(projsPath, all);
    return { ...project, status: computeStatus(project) };
  }

  function updateProject(id, data) {
    const all = readJSON(projsPath);
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    // Validate name / description if provided
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("项目名称不能为空");
      if (data.name.trim().length > 20) throw new Error("项目名称最多20个字符");
    }
    if (data.description !== undefined && data.description.length > 50) {
      throw new Error("项目描述最多50个字符");
    }
    const allowed = ["name", "description", "members", "planStart", "planEnd", "status", "projectSetId"];
    for (const key of allowed) {
      if (data[key] !== undefined) all[idx][key] = data[key];
    }
    writeJSON(projsPath, all);
    return { ...all[idx], status: computeStatus(all[idx]) };
  }

  function deleteProject(id) {
    const all = readJSON(projsPath);
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    writeJSON(projsPath, all);
    return true;
  }

  // ---- Tasks ----

  function createTask(projectId, data) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!proj.tasks) proj.tasks = [];
    const task = {
      id: uid(),
      index: proj.tasks.length + 1,
      name: data.name,
      description: data.description || "",
      done: false,
    };
    proj.tasks.push(task);
    writeJSON(projsPath, all);
    return task;
  }

  function updateTask(projectId, taskId, data) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    const task = proj.tasks?.find((t) => t.id === taskId);
    if (!task) throw new Error(`任务 ${taskId} 不存在`);
    if (data.name !== undefined) task.name = data.name;
    if (data.description !== undefined) task.description = data.description;
    if (data.done !== undefined) task.done = data.done;
    writeJSON(projsPath, all);
    return task;
  }

  function deleteTask(projectId, taskId) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!proj.tasks) proj.tasks = [];
    const idx = proj.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error(`任务 ${taskId} 不存在`);
    proj.tasks.splice(idx, 1);
    // Re-index
    proj.tasks.forEach((t, i) => (t.index = i + 1));
    writeJSON(projsPath, all);
    return true;
  }

  // ---- Files ----

  function addFile(projectId, filePath) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!proj.files) proj.files = [];
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const file = {
      id: uid(),
      name,
      path: filePath,
      uploadedAt: new Date().toISOString().slice(0, 10),
    };
    proj.files.push(file);
    writeJSON(projsPath, all);
    return file;
  }

  function deleteFile(projectId, fileId) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!proj.files) proj.files = [];
    const idx = proj.files.findIndex((f) => f.id === fileId);
    if (idx === -1) throw new Error(`文件 ${fileId} 不存在`);
    proj.files.splice(idx, 1);
    writeJSON(projsPath, all);
    return true;
  }

  function getFilePath(projectId, fileId) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) return null;
    const f = (proj.files || []).find((x) => x.id === fileId);
    return f ? f.path : null;
  }

  // ---- Notes ----

  function createNote(projectId, data) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!proj.notes) proj.notes = [];
    const note = { id: uid(), content: data.content, createdAt: new Date().toISOString().slice(0, 10) };
    proj.notes.push(note);
    writeJSON(projsPath, all);
    return note;
  }

  function updateNote(projectId, noteId, data) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    const note = proj.notes?.find((n) => n.id === noteId);
    if (!note) throw new Error(`备注 ${noteId} 不存在`);
    if (data.content !== undefined) note.content = data.content;
    writeJSON(projsPath, all);
    return note;
  }

  function deleteNote(projectId, noteId) {
    const all = readJSON(projsPath);
    const proj = all.find((p) => p.id === projectId);
    if (!proj) throw new Error(`项目 ${projectId} 不存在`);
    if (!proj.notes) proj.notes = [];
    const idx = proj.notes.findIndex((n) => n.id === noteId);
    if (idx === -1) throw new Error(`备注 ${noteId} 不存在`);
    proj.notes.splice(idx, 1);
    writeJSON(projsPath, all);
    return true;
  }

  return {
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
    // Files
    addFile,
    deleteFile,
    getFilePath,
    // Notes
    createNote,
    updateNote,
    deleteNote,
  };
}
