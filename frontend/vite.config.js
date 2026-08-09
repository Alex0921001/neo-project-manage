import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 浠呭紑鍙戠幆澧冿細鏈湴 mock 鏁版嵁婧愶紙鐙珛鎵撳紑 dev server 鏃舵棤 Hana 瀹夸富閴存潈锛岃蛋鏈湴鏁版嵁锛?
import { mockApi } from "./devmock.js";

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch { resolve(data); }
    });
    req.on("error", () => resolve(undefined));
  });
}

const BUILD_AT = new Date().toISOString();

// 浠?plugin 鏍圭洰褰曡 manifest.json锛岃幏鍙?version 浣滀负闈欐€佹敞鍏?fallback
const __dirname_vite = path.dirname(fileURLToPath(import.meta.url));
let pluginVersion = "?";
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname_vite, "..", "manifest.json"), "utf-8"));
  pluginVersion = manifest.version || "?";
} catch { /* ignore */ }

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    // 开发环境 mock 数据中间件（插件钩子形式，build 不执行）
    {
      name: "dev-mock-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url || "").split("?")[0];
          const m = url.match(/^\/api\/plugins\/[^/]+\/(.+)$/);
          if (m) {
            const pathname = decodeURIComponent(m[1]);
            try {
              const query = Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
              const body = req.method === "GET" ? undefined : await readBody(req);
              const result = await mockApi(req.method || "GET", pathname, query, body);
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
            }
            return;
          }
          next();
        });
      },
    },
  ],
  base: mode === "production" ? "" : "/",
  server: {
    port: 5173,
    strictPort: false,
  },
  define: {
    __BUILD_AT__: JSON.stringify(BUILD_AT),
    __PLUGIN_VERSION__: JSON.stringify(pluginVersion),
    __PLUGIN_SOURCE__: JSON.stringify("dev"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 鍙栨秷寮傛 chunk 鎷嗗垎锛氬叏閮ㄥ唴鑱斿埌鍗曚釜 index-*.js
        // 锛堟彃浠?UI 鐢?Hono app 鍐呰仈娉ㄥ叆 HTML锛岄潤鎬佽矾鐢卞湪 Hana 骞冲彴鎸傝浇绛栫暐涓嬩笉鍙潬锛岃 P0-2 鐪熼棶棰橈級
        inlineDynamicImports: true,
      },
    },
  },
}));

