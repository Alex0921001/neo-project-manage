/**
 * 项目文件 + 文件夹 CRUD：/api/projects/:projectId/files/* 与 /api/projects/:projectId/folders/*
 *
 * 文件夹（V2.1.4 文件系统重构）：多层嵌套（parent_id 自引用），NULL=根目录；
 * 删除走「内容提升」语义（文件和子文件夹提升到父级，不级联删除、不丢结构）。
 */
export function registerFilesRoutes(app, data) {
  // ===== 文件夹 =====

  /** 文件夹列表（树结构，多层嵌套） */
  app.get("/api/projects/:projectId/folders", (c) => {
    try {
      const folders = data.listFolders(c.req.param("projectId"));
      return c.json({ ok: true, data: folders });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  /** 新建文件夹（body: { name, parentId? }，parentId 空=根目录） */
  app.post("/api/projects/:projectId/folders", async (c) => {
    try {
      const body = await c.req.json();
      const folder = data.createFolder(c.req.param("projectId"), body);
      return c.json({ ok: true, data: folder });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  /** 更新文件夹：改名 + 换父级（body: { name?, parentId? }，防环 + 同级重名校验在数据层） */
  app.put("/api/projects/:projectId/folders/:folderId", async (c) => {
    try {
      const body = await c.req.json();
      const folder = data.updateFolder(c.req.param("projectId"), c.req.param("folderId"), body);
      return c.json({ ok: true, data: folder });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  /** 删除文件夹（内容提升：文件和子文件夹提升到被删夹的父级，不删任何文件） */
  app.delete("/api/projects/:projectId/folders/:folderId", (c) => {
    try {
      data.deleteFolder(c.req.param("projectId"), c.req.param("folderId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // ===== 文件 =====

  /** 文件列表：?folderId=（不传=全部 / root=根目录 / 具体 id=该文件夹）+ ?name=（名称模糊搜索） */
  app.get("/api/projects/:projectId/files", (c) => {
    try {
      const folderIdParam = c.req.query("folderId");
      let folderId;
      if (folderIdParam === "root") folderId = null;
      else if (folderIdParam) folderId = folderIdParam;
      const name = c.req.query("name") || undefined;
      const files = data.listFiles(c.req.param("projectId"), { folderId, name });
      return c.json({ ok: true, data: files });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  /** 登记文件（body: { path, digest?, folderId? }，folderId 空=根目录） */
  app.post("/api/projects/:projectId/files", async (c) => {
    try {
      const body = await c.req.json();
      const file = data.addFile(c.req.param("projectId"), body.path, body.digest, body.folderId || null);
      return c.json({ ok: true, data: file });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  /** 移动文件到文件夹（body: { folderId }，folderId 空/root=移回根目录；不传=不动） */
  app.put("/api/projects/:projectId/files/:fileId", async (c) => {
    try {
      const body = await c.req.json();
      const file = data.moveFile(
        c.req.param("projectId"),
        c.req.param("fileId"),
        body.folderId === undefined ? undefined : body.folderId || null
      );
      return c.json({ ok: true, data: file });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  /** 删除文件登记（仅移除登记引用，不影响磁盘文件） */
  app.delete("/api/projects/:projectId/files/:fileId", (c) => {
    try {
      data.deleteFile(c.req.param("projectId"), c.req.param("fileId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
