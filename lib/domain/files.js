import fs from "node:fs";
import path from "node:path";
// Files（V2.6.1 批2拆分自 data.js，机械搬移不改逻辑）
// 初始共享经 ctx 解构；跨模块函数经转发箭头运行时解引用，无循环 import
export function createFilesModule(ctx) {
  const { db, shortId, escapeLike } = ctx;
  const logAudit = (...a) => ctx.logAudit(...a);
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

  return {
    fileRowToObject,
    readFileMeta,
    normalizeDigest,
    addFile,
    getFile,
    listFiles,
    moveFile,
    deleteFile,
    getFilePath,
    folderNameError,
    assertFolderSameLevelName,
    getFolderOrThrow,
    wouldCreateFolderCycle,
    createFolder,
    updateFolder,
    deleteFolder,
    getFolder,
    listFolders,
  };
}
