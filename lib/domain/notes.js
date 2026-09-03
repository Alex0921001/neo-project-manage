// Notes（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createNotesModule(ctx) {
  const { db, logAudit, auditText } = ctx;
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
    logAudit(projectId, "创建备注", "note", note.id, null, JSON.stringify({ content: auditText(note.content) }));
    return { id: note.id, content: note.content, createdAt: note.created_at };
  }

  function updateNote(projectId, noteId, data) {
    const cur = db.prepare("SELECT id, content FROM notes WHERE id = ? AND project_id = ?").get(noteId, projectId);
    if (!cur) throw new Error(`备注不存在`);
    if (data.content !== undefined) {
      if (noteContentEmpty(data.content)) throw new Error("备注内容不能为空");
      db.prepare("UPDATE notes SET content = ? WHERE id = ?").run(sanitizeHtml(data.content), noteId);
      logAudit(projectId, "更新备注", "note", noteId,
        JSON.stringify({ content: auditText(cur.content) }),
        JSON.stringify({ content: auditText(sanitizeHtml(data.content)) }));
    }
    const after = db.prepare("SELECT id, content, created_at FROM notes WHERE id = ?").get(noteId);
    return { id: after.id, content: after.content, createdAt: after.created_at };
  }

  function deleteNote(projectId, noteId) {
    const row = db.prepare("SELECT content FROM notes WHERE id = ? AND project_id = ?").get(noteId, projectId);
    db.prepare("DELETE FROM notes WHERE id = ? AND project_id = ?").run(noteId, projectId);
    if (row) logAudit(projectId, "删除备注", "note", noteId, JSON.stringify({ content: auditText(row.content) }), null);
    return true;
  }
  return {
    noteContentEmpty,
    createNote,
    updateNote,
    deleteNote,
  };
}
