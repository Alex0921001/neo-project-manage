/**
 * 图片上传 + 静态文件服务（富文本内嵌图）
 *
 * - POST /api/projects/:projectId/upload  multipart/form-data, field=file
 *   → { ok, data: { name, url: '/api/plugins/<pluginId>/files/<name>' } }
 * - GET  /files/:name  静态服务 plugin-data/uploads/（mime + no-cache，删除后立即可见）
 *
 * 限制（lib/data.js saveUploadedFile 统一校验）：
 * - 单图 ≤ 2MB
 * - 仅 png / jpg / jpeg / gif / webp
 * - 文件名 = shortId() + ext（防覆盖/穿越）
 */
import path from "node:path";
import fs from "node:fs";

const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const MAX_BYTES = 2 * 1024 * 1024; // 与 lib/data.js 一致

export function registerUploadRoutes(app, data, ctx) {
  const uploadsDir = path.join(ctx.dataDir, "uploads");

  app.post("/api/projects/:projectId/upload", async (c) => {
    try {
      // P1-2：Content-Length 前置拦截，避免超大请求先读入内存（DoS 面）
      const contentLength = Number(c.req.header("content-length") || 0);
      if (contentLength > MAX_BYTES + 1024) { // +1KB 容忍 multipart 边界开销
        return c.json({ ok: false, error: "单图不能超过 2MB" }, 413);
      }
      const projectId = c.req.param("projectId");
      if (!data.getProject(projectId)) throw new Error(`项目 ${projectId} 不存在`);
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!file || typeof file === "string") throw new Error("缺少文件（multipart field=file）");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > MAX_BYTES) {
        return c.json({ ok: false, error: "单图不能超过 2MB" }, 413);
      }
      const info = data.saveUploadedFile(bytes, file.name || "");
      return c.json(
        {
          ok: true,
          data: { name: info.name, url: `/api/plugins/${ctx.pluginId}/files/${info.name}` },
        },
        200,
        { "X-Content-Type-Options": "nosniff" }
      );
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });

  // 静态文件：仅允许 短ID.扩展名 形式（防路径穿越）
  app.get("/files/:name", (c) => {
    try {
      const name = c.req.param("name");
      if (!/^[\w-]+\.[a-z0-9]+$/i.test(name)) {
        return c.json({ ok: false, error: "invalid file name" }, 400);
      }
      const filePath = path.join(uploadsDir, name);
      if (!fs.existsSync(filePath)) return c.json({ ok: false, error: "not found" }, 404);
      const ext = path.extname(name).slice(1).toLowerCase();
      const mime = MIME[ext] || "application/octet-stream";
      return c.body(fs.readFileSync(filePath), 200, {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        // 图片小、删除后需立即可见，不设长缓存（P3-9）
        "Cache-Control": "no-cache",
      });
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 400);
    }
  });
}
