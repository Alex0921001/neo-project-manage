# neo-project-manage v2 App

`neo-project-manage` 的 v2 形态。与仓库里的 v1 插件**并行共存**，App id 不同，装上去不抢 v1 的工具名。

- **App id**：`neo-project-manage-v2`
- **工具名**：`neo-project-manage_<原名>`（与 v1 暴露名一致，Agent 侧调用零改动）
- **数据目录**：`<HANA_HOME>/app-data/neo-project-manage-v2`（v1 是 `plugin-data/neo-project-manage`）

## 为什么是 v2

v1 插件线已永久冻结，产品不再提供 v1 的制作、脚手架与调试通道。v2 App 的入口代码跑在独立 Node 子进程里（`--permission`，不开 `--allow-addons`），因此：

- 原生模块 better-sqlite3 不可用 → 数据层改用 Node 内置 `node:sqlite`（`lib/sqlite-adapter.js` 抹平接口）
- 顶层 `routes/*.js` 与 `ctx.routes.register()` 互斥 → 路由源码目录在打包时改名为 `backend/`

## 构建

```bash
npm run build:v2
```

产出 `dist/neo-project-manage-v2/`：

```
manifest.json          # manifestVersion 2
index.js               # defineApp 入口（注册 125 工具 + 挂载路由）
sdk/                   # 服务端 SDK（从 hana-app-creator 资产解出）
lib/ tools/ backend/ icons/ docs/
ui/index.html + ui/assets/*      # 前端构建产物
assets/icon.png  ui/assets/cover.png
```

可选环境变量：`HANA_APP_SDK_TGZ` 指定 SDK 包路径（默认取 `~/.hanako/skills/hana-app-creator/assets/sdk/hana-app-sdk.tgz`）。

## 校验

```bash
npm run validate:v2            # 静态校验
npm run validate:v2 -- --smoke # 运行时冒烟（UI 阶段需要 Electron）
```

`DYNAMIC_DEPENDENCIES_NOT_PROVEN` 是预期警告：入口按目录动态 import 工具，静态检查追不到。

## 安装（开发期，与 v1 并行）

1. 把 `dist/neo-project-manage-v2/` 整个目录拷到 `<HANA_HOME>/apps/neo-project-manage-v2/`（目录名必须等于 manifest 的 `id`）。
2. 重启 Hana，去「市场 → 已安装 → 待批准」批准它。
3. 批准后 125 个工具进入工具注册表；进模型循环还需在「设置 → 应用 → 应用能力」里给这个 App 打开开关。

或在 Hana Builder 的隔离环境里装载调试（本地目录安装支持「重新加载」）。

## 数据迁移

```bash
npm run migrate:v2            # 默认 ~/.hanako
npm run migrate:v2 -- --hana-home <dir> --dry-run
```

把 `plugin-data/neo-project-manage/projects.sqlite`（含 WAL 边车）复制到 `app-data/neo-project-manage-v2/`。v1 数据保持原样，删目标目录即可回滚。

## 从 v1 切换到 v2

1. 先完成迁移与批准，确认 v2 侧工具与页面都正常。
2. 停用/卸载 v1 插件（`plugins/neo-project-manage`）。
3. 如需保持工具名不变，v2 已用同一前缀，Agent 侧无需改动。

## 本仓库相关

- `v2/manifest.json`、`v2/index.js`：v2 清单与入口源码
- `scripts/build-v2-app.mjs`：组装脚本
- `scripts/validate-v2-app.mjs`：校验包装（自动定位 Hana 工具链）
- `scripts/migrate-v1-to-v2-data.mjs`：数据迁移
- `scripts/gen-v2-icons.py`：图标与卡片封面生成
- `lib/sqlite-adapter.js`：node:sqlite 适配层
- `frontend/src/api/runtime.js`：前端 v1/v2 双形态运行时探测
