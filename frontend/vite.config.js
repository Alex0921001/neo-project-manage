import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILD_AT = new Date().toISOString();

// 从 plugin 根目录读 manifest.json，获取 version 作为静态注入 fallback
const __dirname_vite = path.dirname(fileURLToPath(import.meta.url));
let pluginVersion = "?";
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname_vite, "..", "manifest.json"), "utf-8"));
  pluginVersion = manifest.version || "?";
} catch { /* ignore */ }

export default defineConfig({
  plugins: [vue()],
  base: "",
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
        // 取消异步 chunk 拆分：全部内联到单个 index-*.js
        // （插件 UI 由 Hono app 内联注入 HTML，静态路由在 Hana 平台挂载策略下不可靠，见 P0-2 真问题）
        inlineDynamicImports: true,
      },
    },
  },
});
