# neo-project-manage（项目管理）

面向 Agent 与用户的项目与任务管理工具。支持项目集、项目、树形任务、批注（便利贴）、文件引用与项目备注的完整 CRUD，通过 REST API 与 Agent 工具两种方式使用。

## 功能特性

- **项目集**：对项目分组管理，支持创建 / 重命名 / 删除，删除时校验集下无项目
- **项目**：名称、描述、成员、计划起止时间、状态（待开始 / 进行中 / 已完成 / 已延期）、归属项目集
  - 项目状态自动计算：逾期未开始 / 未完成会自动标记为「已延期」
  - 描述最多 200 字符，名称最多 20 字符
- **任务树**：任意层级父子任务（通过 `parent_task_id` 自引用），支持增删改、批量创建、拖拽排序、跨层级移动（含环检测）、级联删除
- **批注（便利贴）**：挂在任务上的便签，支持编辑内容与确认状态
- **文件**：项目文件引用登记与删除，Windows 下支持文件选择对话框
- **备注**：项目级自由文本备注，支持增删改
- **SQLite 存储**：better-sqlite3，WAL 模式，外键级联，卸载插件数据不丢

## 安装

- 需要 HanaAgent 版本 ≥ `0.159.0`（`manifest.json` 中 `minAppVersion`）
- 在 Hana 中通过插件市场搜索「项目管理」安装；开发者模式可通过插件源码目录安装（dev slot）
- 首次加载自动创建数据库与表结构（幂等），无需手动初始化

## 工具清单

Agent 工具位于 `tools/` 目录，每个文件一个工具，导出 `name / description / parameters / execute`。共 21 个：

### create（6）

| 工具 | 说明 |
| --- | --- |
| `create_project_set` | 创建项目集 |
| `create_project` | 创建项目 |
| `create_task` | 创建任务（支持父任务 / 文件引用） |
| `create_tasks` | 批量创建任务（可指定父任务，最多 50 个） |
| `create_annotation` | 给任务添加便利贴（批注） |
| `create_annotations` | 批量创建批注（一次多个，最多 50 个） |

### update（4）

| 工具 | 说明 |
| --- | --- |
| `update_project_set` | 编辑项目集名称 |
| `update_project` | 编辑项目信息（名称、描述、成员、时间、状态、归属） |
| `update_task` | 编辑任务（改名、改描述、标记完成、移动父级、替换文件引用） |
| `update_annotation` | 编辑便利贴内容或确认状态 |

### delete（6）

| 工具 | 说明 |
| --- | --- |
| `delete_project_set` | 删除项目集（集下有项目时拒绝） |
| `delete_project` | 删除项目（含已完成任务时拒绝） |
| `delete_task` | 删除任务（级联删除子任务） |
| `delete_tasks` | 批量删除任务（父任务级联删除其子任务） |
| `delete_annotation` | 删除便利贴（批注） |
| `delete_annotations` | 批量删除便利贴（一次多个，最多 50 个，不存在的会列出） |

### list（4）

| 工具 | 说明 |
| --- | --- |
| `list_project_sets` | 列出项目集（含各集下项目数量） |
| `list_projects` | 列出项目（可选 keyword：按项目名模糊匹配，跨项目集或限定集内） |
| `list_annotations` | 列出任务下的便利贴 |
| `list_tasks` | 列出项目下的任务（可按状态 done/undone/all 与负责人筛选，可选 keyword：按任务名/描述/批注内容模糊搜索） |

### get（1）

| 工具 | 说明 |
| --- | --- |
| `get_project` | 获取项目详情（含树形任务、文件、备注） |

## API 路由

路由位于 `routes/modules/`，按职责分模块注册：

### 项目集 `project-sets.js`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/project-sets` | 列出项目集（含项目数量） |
| POST | `/api/project-sets` | 创建项目集 |
| PUT | `/api/project-sets/:id` | 重命名项目集 |
| DELETE | `/api/project-sets/:id` | 删除项目集 |

### 项目 `projects.js`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects` | 列出项目（`?projectSetId=` 可按项目集筛选，`?keyword=` 按项目名模糊匹配） |
| GET | `/api/projects/:id` | 获取项目详情 |
| POST | `/api/projects` | 创建项目 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |

### 任务 `tasks.js`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:projectId/tasks` | 列出任务（`?status=done/undone/all`、`?assignee=成员名`、`?keyword=` 按任务名 / 描述 / 批注内容模糊搜索） |
| POST | `/api/projects/:projectId/tasks` | 创建任务（支持 `parentTaskId`） |
| PUT | `/api/projects/:projectId/tasks/:taskId` | 更新任务 |
| DELETE | `/api/projects/:projectId/tasks/:taskId` | 删除任务（级联） |
| POST | `/api/projects/:projectId/reorder-tasks` | 重排顶层任务 |
| POST | `/api/projects/:projectId/tasks/:taskId/reorder-subtasks` | 重排子任务 |
| POST | `/api/projects/:projectId/tasks/:taskId/move` | 移动到指定父级 / 位置 |

### 批注 `annotations.js`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects/:projectId/tasks/:taskId/annotations` | 列出任务下的批注 |
| POST | `/api/projects/:projectId/tasks/:taskId/annotations` | 添加批注 |
| PUT | `/api/projects/:projectId/tasks/:taskId/annotations/:annId` | 编辑批注 / 标记确认 |
| DELETE | `/api/projects/:projectId/tasks/:taskId/annotations/:annId` | 删除批注 |
| POST | `/api/projects/:projectId/tasks/:taskId/annotations/batch` | 批量创建批注（body `{ items: [{ content }] }`，最多 50 个） |
| DELETE | `/api/projects/:projectId/tasks/:taskId/annotations/batch` | 批量删除批注（body `{ ids: string[] }`，最多 50 个，返回 `{ deleted, notFound }`） |

（兼容旧路径：`/subtasks/:subtaskId/annotations/*`，subtaskId 直接当 taskId 使用）

### 文件 `files.js`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects/:projectId/files` | 登记项目文件（body 传 `path`） |
| DELETE | `/api/projects/:projectId/files/:fileId` | 删除文件引用 |

### 备注 `notes.js`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects/:projectId/notes` | 添加备注 |
| PUT | `/api/projects/:projectId/notes/:noteId` | 编辑备注 |
| DELETE | `/api/projects/:projectId/notes/:noteId` | 删除备注 |

## 数据存储

- 数据库：SQLite（better-sqlite3，原生绑定已 vendor 到 `lib/vendor/better-sqlite3/`）
- 位置：`ctx.dataDir/projects.sqlite`（Hana 插件数据目录，卸载插件不删除）
- 模式：WAL 日志、外键约束开启、删除走级联
- 表：`projects`、`project_sets`、`tasks`（自引用父任务）、`files`、`task_file_refs`、`notes`、`annotations`、`schema_meta`
- 迁移：`npm run migrate`（scripts/migrate-to-sqlite.js，从旧 JSON 存储迁移）

## 开发指南

- **新增工具**：在 `tools/` 下新建文件，导出 `name`（工具名，snake_case）、`description`、`parameters`（JSON Schema）、`execute(input, toolCtx)`。宿主自动加载 tools 目录，无需注册。`toolCtx.dataDir` 为数据目录，通过 `createDataAccess(toolCtx.dataDir)` 拿到数据访问对象
- **新增路由**：在 `routes/modules/` 下新建文件，导出 `registerXxxRoutes(app, data)`，然后到 `routes/ui.js` 中 import 并调用注册（同时可加 diag 探针路由）
- **新增数据访问**：在 `lib/data.js` 的 `createDataAccess(dataDir)` 内部编写函数（可直接使用 `db` 与 `db.prepare`），并加入 return 对象导出；模块级纯函数放在 `createDataAccess` 外
- **约定**：错误用 `throw new Error(...)`，路由层统一捕获并返回 `{ ok: false, error }`；写入操作使用事务（`db.transaction` 或 `tx`）；ID 用 `shortId()`（8 位）

## 版本历史

### V1.0.1（2026-08-02）

- 项目描述字符限制从 50 放宽到 200
- 新增 `delete_annotation` 工具（删除便利贴）
- 新增 `list_tasks` 工具与 `GET /api/projects/:projectId/tasks` 路由，支持 `status`（done/undone/all）与 `assignee`（成员名）筛选
- `list_projects` 新增 `keyword` 参数（按项目名模糊匹配）
- `list_tasks` 新增 `keyword` 参数（按任务名 / 描述 / 批注内容模糊搜索）
- 新增 `create_annotations` 工具与 `POST /api/.../annotations/batch` 路由（批量建批注，最多 50 个，事务包裹）
- 新增 `delete_annotations` 工具与 `DELETE /api/.../annotations/batch` 路由（批量删批注，最多 50 个，不存在不阻断并返回 notFound）
- 新增 README

### V1.0.0

- 初始版本：项目集 / 项目 / 树形任务 / 批注 / 文件 / 备注的完整 CRUD
- SQLite 存储迁移（better-sqlite3），支持 Agent 工具与 REST API
