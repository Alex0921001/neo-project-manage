## 项目管理 v3.0.0

本项目从 v1 插件形态完整迁移为 v2 App。功能面与 2.6.6 对齐，数据层换为 Node 内置 `node:sqlite`。

### 安装包

| 文件 | 说明 |
| --- | --- |
| `app-neo-project-manage-v2-3.0.0.zip` | 应用安装包，供 Hana 市场与手动安装使用 |
| `app-neo-project-manage-v2-3.0.0.entry.json` | 条目元数据，含 `archive.sha256` 与权限声明 |

### 本版变更

- 数据层：`better-sqlite3` 换为 Node 内置 `node:sqlite`，FTS5 + trigram 中文检索能力保留
- 结构：125 个工具与 117 条路由全量迁移至 v2 App 结构
- 文件读取：工作区文件改走宿主资源通道 `ctx.resources`，符合 v2 沙箱权限模型
- 移除：不再维护独立的 MCP server 通道，统一走 App 工具，避免同名工具重复与数据源分叉
- 修复：open-file / open-folder 三态误判；requirements 空 body 返回 500

### 能力概览

项目集 / 项目 / 任意层级任务 / 便利贴批注 / 需求 / 方案 / 统一评论 / 版本快照 / 验证卡与验证项 / 临时任务 / 消息中心 / 全文检索 / 风险识别 / 周报生成 / 审计追踪。

工具面支持批量操作：批量新增事务包裹整体回滚，批量编辑、删除、流转逐条独立校验，单次上限 50 条。

### 权限

`app/resources.read`、`app/tools.expose-to-model`、`app/process.spawn`、`app/ui.open-external`、`app/ui.clipboard-write`。逐条用途见仓库 README。

### 数据与隐私

数据保存在本机 SQLite（`数据目录/projects.sqlite`），不上传服务器，不发遥测，卸载不删除数据。

### 兼容性

- 最低 Hana 版本：`1.1.0-beta`
- 文件选取、打开文件、资源管理器定位依赖 Windows 桌面环境
- docx 方案导入依赖系统 `tar`（Windows 10 1803+ 内置）

### 自测

- `validate-v2-app.mjs`：0 error, 1 warning（检查器边界说明）
- 单元测试：134 项全部通过
