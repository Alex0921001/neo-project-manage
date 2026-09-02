/**
 * 统一评论（V2.6）：需求/方案共用，/api/projects/:projectId/comments/*
 *
 * GET    /api/projects/:projectId/comments?targetType=&targetId=   评论列表（新→旧）
 * POST   /api/projects/:projectId/comments                         加评论 { targetType, targetId, content, quote? }
 * PUT    /api/projects/:projectId/comments/:commentId              编辑评论 { content }
 * DELETE /api/projects/:projectId/comments/:commentId              删评论
 *
 * 旧接口 /plans/:planId/comments POST/DELETE 保留在 plans.js（内部转写同一数据层）。
 * 增删改全量审计（targetType=comment，删除带内容快照）；查询随详情接口返回，不单独审计。
 */
export function registerCommentsRoutes(app, data) {
  app.get("/api/projects/:projectId/comments", (c) => {
    const targetType = c.req.query("targetType");
    const targetId = c.req.query("targetId");
    if (!targetType || !targetId) {
      return c.json({ ok: false, error: "targetType 与 targetId 必传" }, 400);
    }
    try {
      return c.json({ ok: true, data: data.getComments(c.req.param("projectId"), targetType, targetId) });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  app.post("/api/projects/:projectId/comments", async (c) => {
    const body = await c.req.json();
    try {
      const comment = data.addComment(
        c.req.param("projectId"), body.targetType, body.targetId, body.content,
        body.quote ?? null, body.quoteAnchor ?? null
      );
      return c.json({ ok: true, data: comment });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.put("/api/projects/:projectId/comments/:commentId", async (c) => {
    const body = await c.req.json();
    try {
      const comment = data.updateComment(c.req.param("projectId"), c.req.param("commentId"), body.content);
      return c.json({ ok: true, data: comment });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });

  app.delete("/api/projects/:projectId/comments/:commentId", (c) => {
    try {
      data.deleteComment(c.req.param("projectId"), c.req.param("commentId"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, e.message.includes("不存在") ? 404 : 400);
    }
  });
}
