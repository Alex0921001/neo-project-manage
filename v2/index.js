/**
 * neo-project-manage v2 App 入口
 *
 * 从 v1 插件全量搬迁而来：同一份 lib / tools / routes 源码，换成 v2 装载形态。
 * - 工具经 `sdk.tools.register` 注册（125 个，逐文件动态 import）
 * - 后端路由经 `sdk.routes.register` 挂载（对外 /api/apps/<id>/routes/*）
 * - 数据落在 `sdk.dataDir`（app-data/neo-project-manage-v2）
 *
 * 工具名保持 `neo-project-manage_<原名>`，与 v1 暴露名一致，Agent 侧调用零改动。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineApp } from "./sdk/app-contract/server-client.js";
import registerPluginUiRoutes from "./backend/ui.js";
import { setScratchDir } from "./lib/plan-import.js";
import { createHostFs } from "./lib/host-fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const name = "neo-project-manage-v2";

/** 工具名前缀：与 v1 插件暴露名保持一致 */
const TOOL_PREFIX = "neo-project-manage_";

export default defineApp(async (sdk) => {
  await sdk.logger.info("[neo-pm] v2 app loading…");

  const dataDir = sdk.dataDir;
  // docx 导入要写临时文件；v2 只有 app-data 可写，指到 app-data 内
  setScratchDir(path.join(dataDir, ".scratch"));
  // 读工作区文件走宿主 ResourceIO（v2 子进程许可根外无法裸 fs 读）
  const hostFs = createHostFs(sdk.resources);
  // routes/ui.js 与 tools/*.js 沿用 v1 的 ctx 形状（dataDir / log / pluginId / pluginKey），
  // 这里把 v2 SDK 的能力适配成同一份形状，源码零改动。
  const legacyCtx = {
    dataDir,
    log: sdk.logger,
    pluginId: "neo-project-manage-v2",
    pluginKey: "app",
    resources: sdk.resources,
    hostFs,
  };

  // 1) 后端路由（对外 /api/apps/<id>/routes/*）
  await sdk.routes.register((app) => {
    registerPluginUiRoutes(app, legacyCtx);
  });

  // 2) 工具注册：遍历 tools/ 目录，逐文件动态 import
  const toolsDir = path.join(__dirname, "tools");
  const files = fs
    .readdirSync(toolsDir)
    .filter((f) => f.endsWith(".js"))
    .sort();

  let count = 0;
  for (const file of files) {
    let mod;
    try {
      mod = await import(pathToFileURL(path.join(toolsDir, file)).href);
    } catch (err) {
      await sdk.logger.warn(`[neo-pm] 工具加载失败 ${file}: ${err.message}`);
      continue;
    }
    if (!mod || typeof mod.name !== "string" || typeof mod.execute !== "function") {
      await sdk.logger.warn(`[neo-pm] 跳过非工具文件 ${file}`);
      continue;
    }
    await sdk.tools.register({
      name: `${TOOL_PREFIX}${mod.name}`,
      description: mod.description || "",
      parameters: mod.parameters || { type: "object", properties: {} },
      execute: (input) => mod.execute(input, { dataDir, log: sdk.logger, resources: sdk.resources, hostFs }),
    });
    count += 1;
  }

  await sdk.logger.info(`[neo-pm] v2 app ready: ${count} tools registered, routes mounted`);
});
