# neo-project-manage（项目管理）

面向 Agent 与用户的项目与任务管理工具。支持项目集、项目、树形任务、任务成员与起止时间、批注（便利贴）、文件引用、项目备注与任务日历的完整 CRUD，通过 REST API 与 Agent 工具两种方式使用。

> 当前版本：**V1.2.0**（Element Plus 弹窗 · Tiptap 富文本 · 任务成员/起止时间 · 任务日历）

## 功能特性

- **项目集**：对项目分组管理，支持创建 / 重命名 / 删除，删除时校验集下无项目
- **项目**：名称、富文本描述、成员、计划起止时间、状态（待开始 / 进行中 / 已完成 / 已延期）、归属项目集
  - 项目状态自动计算：逾期未开始 / 未完成会自动标记为「已延期」
  - 名称最多 20 字符（V1.2 起描述支持富文本，不再限制长度）
- **任务树**：任意层级父子任务（通过 `parent_task_id` 自引用），支持增删改、批量创建、拖拽排序、跨层级移动（含环检测）、级联删除
- **任务成员 + 起止时间**（V1.2 新增）：任务可分配多个成员（`assignees` 数组，候选池聚合所有项目成员）与开始 / 结束日期；`endDate >= startDate` 硬校验，越出项目计划范围软提示
- **任务日历**（V1.2 新增）：项目详情页独立的「日历」tab（位于任务/文件/备注之间），展示有日期的任务，支持全部 / 未完成 / 已完成筛选，点击跳转到对应任务并滚动定位
- **富文本**（V1.2 新增）：任务描述 / 项目描述 / 备注支持 Tiptap 富文本，可插入图片（本地压缩后 base64 内联存储，最长边 1280px / JPEG 0.82 / PNG 保留透明），点击图片全屏预览
- **Element Plus 弹窗**（V1.2 新增）：全部弹窗统一为 el-dialog + el-form + rules 校验，主题对齐 OKLCH 设计令牌
- **批注（便利贴）**：挂在任务上的便签，支持编辑内容与确认状态
- **文件**：项目文件引用登记与删除，Windows 下支持文件选择对话框
- **备注**：项目级富文本备注，支持增删改
- **SQLite 存储**：better-sqlite3，WAL 模式，外键级联，卸载插件数据不丢；schema v1→v3 自动迁移（幂等），老数据兼容

## 安装

- 需要 HanaAgent 版本 ≥ `0.159.0`（`manifest.json` 中 `minAppVersion`）
- 在 Hana 中通过插件市场搜索「项目管理」安装；开发者模式可通过插件源码目录安装（dev slot）
- 首次加载自动创建数据库与表结构（幂等），无需手动初始化

## 工具清单

Agent 工具位于 `tools/` 目录，每个文件一个工具，导出 `name / description / parameters / execute`。共 22 个：

### create（6）

| 工具 | 说明 |
| --- | --- |
| `create_project_set` | 创建项目集 |
| `create_project` | 创建项目 |
| `create_task` | 创建任务（支持父任务 / 文件引用 / 成员 / 起止日期） |
| `create_tasks` | 批量创建任务（可指定父任务 / 成员 / 起止日期，最多 50 个） |
| `create_annotation` | 给任务添加便利贴（批注） |
| `create_annotations` | 批量创建批注（一次多个，最多 50 个） |

### update（4）

| 工具 | 说明 |
| --- | --- |
| `update_project_set` | 编辑项目集名称 |
| `update_project` | 编辑项目信息（名称、描述、成员、时间、状态、归属） |
| `update_task` | 编辑任务（改名、改描述、改成员、改起止日期、标记完成） |
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
| `list_tasks` | 列出项目下的任务（可按状态 done/undone/all、负责人与日期范围筛选，可选 keyword：按任务名/描述/批注内容模糊搜索） |

### get（2）

| 工具 | 说明 |
| --- | --- |
| `get_project` | 获取项目详情（含树形任务、文件、备注） |
| `get_task` | 按任务 ID 全局查询任务详情（含所属项目名、父任务名、批注、子任务） |

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
| GET | `/api/projects/:projectId/tasks` | 列出任务（`?status=done/undone/all`、`?assignee=成员名` 精确匹配 `assignees` JSON 数组、`?keyword=` 按任务名 / 描述 / 批注内容模糊搜索） |
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

### 图片上传 `upload.js`（V1.2，历史路由）

> 前端富文本图片已改 **base64 内联**（本地压缩后直接入库，绕开网关鉴权），此上传路由保留兼容：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/projects/:projectId/upload` | 富文本图片上传（multipart field=file，≤2MB，png/jpg/jpeg/gif/webp） |
| GET | `/files/:name` | uploads 静态文件服务（mime + 短缓存实时可见，防路径穿越） |

### 任务日历 `calendar.js`（V1.2）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/calendar-tasks?status=all\|undone\|done` | 全局有日期任务（日历事件源） |
| GET | `/api/projects/:projectId/calendar-tasks?status=...` | 项目级有日期任务 |

## 数据存储

- 数据库：SQLite（better-sqlite3，原生绑定已 vendor 到 `lib/vendor/better-sqlite3/`）
- 位置：`ctx.dataDir/projects.sqlite`（Hana 插件数据目录，卸载插件不删除）
- 模式：WAL 日志、外键约束开启、删除走级联
- 表：`projects`、`project_sets`、`tasks`（自引用父任务）、`files`、`task_file_refs`、`notes`、`annotations`、`schema_meta`
- schema 版本：V1.2 = 3；启动时自动迁移 v1/v2→v3（v2 库先 DROP `idx_tasks_assignee` 再 DROP `assignee` 列然后 ADD `assignees` TEXT 存 JSON 数组，v1 库直接走 ADD 列路径，幂等，老数据兼容；v2 库的 `assignee` 存量数据会被丢弃）
- 索引：`idx_tasks_assignees`（`json_each` 元素索引）/ `idx_tasks_start_date` / `idx_tasks_end_date`
- 图片：**前端 base64 内联存储**（内容自包含，无 403 风险）；历史上传路径 `ctx.dataDir/uploads/`（shortId + ext）保留兼容
- 迁移：`npm run migrate`（scripts/migrate-to-sqlite.js，从旧 JSON 存储迁移）

## 开发指南

- **新增工具**：在 `tools/` 下新建文件，导出 `name`（工具名，snake_case）、`description`、`parameters`（JSON Schema）、`execute(input, toolCtx)`。宿主自动加载 tools 目录，无需注册。`toolCtx.dataDir` 为数据目录，通过 `createDataAccess(toolCtx.dataDir)` 拿到数据访问对象
- **新增路由**：在 `routes/modules/` 下新建文件，导出 `registerXxxRoutes(app, data)`，然后到 `routes/ui.js` 中 import 并调用注册（同时可加 diag 探针路由）
- **新增数据访问**：在 `lib/data.js` 的 `createDataAccess(dataDir)` 内部编写函数（可直接使用 `db` 与 `db.prepare`），并加入 return 对象导出；模块级纯函数放在 `createDataAccess` 外
- **约定**：错误用 `throw new Error(...)`，路由层统一捕获并返回 `{ ok: false, error }`；写入操作使用事务（`db.transaction` 或 `tx`）；ID 用 `shortId()`（8 位）

## 版本历史

### V1.2.0（2026-08-07）

- **任务成员 + 起止时间**：tasks 表新增 `assignees`（JSON 数组）/ `start_date` / `end_date`（schema v1/v2→v3 自动迁移，幂等）；`create_task` / `update_task` / `create_tasks` / `list_tasks` 工具与 REST 接口支持新参数；list_tasks 按成员筛选使用 `json_each(t.assignees)` 元素精确匹配 + `json_valid` 兜底防脏数据崩溃
- **任务日历**：项目详情页独立的「日历」tab（位于任务/文件/备注之间），事件源切换为有日期的任务，支持全部 / 未完成 / 已完成筛选，点击跳转项目详情并滚动定位任务
- **富文本**：引入 Tiptap v2（异步加载），任务描述 / 项目描述 / 备注支持富文本；图片**本地压缩后 base64 内联**（最长边 1280px / JPEG 0.82 / PNG 保留透明，绕开网关鉴权），点击图片全屏预览；移除项目描述 200 字符限制
- **Element Plus 弹窗**：全部弹窗统一重构为 el-dialog + el-form + rules（任务 / 子任务 / 文件 / 备注 / 项目 / 项目集 / 确认框），主题覆盖对齐 OKLCH 设计令牌
- **上传接口**：`POST /api/projects/:id/upload` + `GET /files/:name` 静态服务（防路径穿越，前端已改 base64 内联，保留兼容）
- **日历接口**：`GET /api/calendar-tasks` / `GET /api/projects/:id/calendar-tasks`

### V1.0.1（2026-08-02）

- 项目描述字符限制从 50 放宽到 200
- 新增 `delete_annotation` 工具（删除便利贴）
- 新增 `list_tasks` 工具与 `GET /api/projects/:projectId/tasks` 路由，支持 `status`（done/undone/all）与 `assignee`（成员名，按 `assignees` JSON 数组精确筛选）筛选
- `list_projects` 新增 `keyword` 参数（按项目名模糊匹配）
- `list_tasks` 新增 `keyword` 参数（按任务名 / 描述 / 批注内容模糊搜索）
- 新增 `create_annotations` 工具与 `POST /api/.../annotations/batch` 路由（批量建批注，最多 50 个，事务包裹）
- 新增 `delete_annotations` 工具与 `DELETE /api/.../annotations/batch` 路由（批量删批注，最多 50 个，不存在不阻断并返回 notFound）
- 新增 README

### V1.0.0

- 初始版本：项目集 / 项目 / 树形任务 / 批注 / 文件 / 备注的完整 CRUD
- SQLite 存储迁移（better-sqlite3），支持 Agent 工具与 REST API
