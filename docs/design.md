# 项目管理插件 — 设计文档

## 1. 概览

项目管理 Hana 插件，提供项目集 + 项目管理、任务跟踪、文件管理和禅道 Bug 看板功能。Agent 可通过 tools 在对话中操作全部数据。

## 2. 页面结构

| 页面 | 路由 | 说明 |
|------|------|------|
| 项目管理主页 | `/page` | 左右分栏：项目集(40%) + 项目(60%) |
| 项目详情页 | `/page/project/:id` | 滚动一页展示项目详情 |
| 禅道看板 | `/page/zentao` | 独立页面，拉取 Bug 按标题前缀分组 |

侧边栏：
- 📋 项目管理（page）
- 🐞 禅道看板（zentao 子页）

## 3. 数据模型

### 项目集 (ProjectSet)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一 ID |
| name | string | 项目集名称 |
| createdAt | string | 创建时间 |

### 项目 (Project)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一 ID |
| name | string | 项目名 |
| description | string | 描述 |
| members | string[] | 成员列表 |
| planStart | string | 计划开始日期 |
| planEnd | string | 计划结束日期 |
| status | string | 待开始 / 进行中 / 已完成 / 已延期 |
| projectSetId | string | 归属项目集 ID，空字符串表示未归类 |
| tasks | Task[] | 任务列表 |
| files | FileItem[] | 文件列表 |
| createdAt | string | 创建时间 |

### 任务 (Task)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一 ID |
| index | number | 序号 |
| name | string | 任务名称 |
| description | string | 简述（V1.2 起支持富文本 HTML） |
| done | boolean | 完成标记 |
| assignee | string | 任务成员（V1.2 新增，必须属于项目 members，可空） |
| startDate | string | 开始日期 YYYY-MM-DD（V1.2 新增，可空） |
| endDate | string | 结束日期 YYYY-MM-DD（V1.2 新增，>= startDate，可空） |
| parentTaskId | string | 父任务 ID（树形结构） |
| fileRefs | string[] | 关联文件 ID 列表 |
| annotations | Annotation[] | 批注列表 |
| subtasks | Task[] | 子任务树 |

### 任务字段校验（V1.2，lib/data.js 集中实现）
- `endDate >= startDate`：违反则抛错（硬校验）
- 任务日期越出项目 [planStart, planEnd]：软提示（warnings 挂返回值，不阻断）
- `assignee` 非空且不在项目 members：抛错（硬校验）
- 日期格式必须 YYYY-MM-DD

### 备注 (Note)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一 ID |
| content | string | 内容（V1.2 起支持富文本 HTML） |
| createdAt | string | 创建时间 |

### 文件 (FileItem)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一 ID |
| name | string | 文件名 |
| uploadedAt | string | 上传时间 |

### 状态计算规则
- `已延期`: 当前时间 > planStart 且状态为"待开始"，或 当前时间 > planEnd 且状态不为"已完成"
- 其他状态由用户手动设置

## 4. 数据存储

SQLite（better-sqlite3，WAL 模式）存于 `ctx.dataDir/projects.sqlite`：
- `schema_meta`：schema 版本（V1.2 = 2），启动时自动迁移（v1 → v2 幂等：tasks 表补 assignee / start_date / end_date 列 + 索引）
- `project_sets` / `projects` / `tasks` / `files` / `task_file_refs` / `notes` / `annotations`
- 图片上传：`plugin-data/uploads/`（shortId + ext），URL 由 upload 路由返回

## 4.1 V1.2 新增接口

| 接口 | 说明 |
|------|------|
| `GET /api/calendar-tasks?status=all\|undone\|done` | 全局有日期任务（日历事件源） |
| `GET /api/projects/:id/calendar-tasks?status=...` | 项目级有日期任务 |
| `POST /api/projects/:id/upload` | 富文本图片上传（multipart field=file，≤2MB，png/jpg/jpeg/gif/webp） |
| `GET /files/:name` | uploads 静态文件服务 |

## 4.2 V1.2 前端组件

- Element Plus 2.x 全局引入（主题变量覆盖对齐 OKLCH 令牌）
- 全部弹窗统一为 el-dialog + el-form + rules
- RichEditor（Tiptap v2 异步加载）：任务/项目/备注的富文本编辑，图片上传插入
- 富文本图片点击 preview（el-image-viewer）

## 5. Agent 工具

| 工具名 | 说明 | 操作 |
|--------|------|------|
| `list_project_sets` | 列出所有项目集 | 读 |
| `create_project_set` | 创建项目集 | 写 |
| `update_project_set` | 编辑项目集 | 写 |
| `delete_project_set` | 删除项目集（集下有空项目时报错） | 写 |
| `list_projects` | 列出项目（可按项目集筛选） | 读 |
| `get_project` | 获取项目详情（含任务、文件） | 读 |
| `create_project` | 创建项目 | 写 |
| `update_project` | 编辑项目 | 写 |
| `delete_project` | 删除项目 | 写 |
| `create_task` | 在项目下创建任务 | 写 |
| `update_task` | 编辑任务（改名、标记完成） | 写 |
| `delete_task` | 删除任务 | 写 |
| `list_zentao_bugs` | 获取禅道 Bug 并按分组返回 | 读 |

## 6. 项目详情页内容（一页滚动）

```
┌────────────────────────────────────────────┐
│  ← 返回    项目名                [编辑项目] │
├────────────────────────────────────────────┤
│ ┌── 项目信息 ──────────────────────────────┐│
│ │ 描述 / 成员 / 时间 / 状态（含延期标记）   ││
│ └──────────────────────────────────────────┘│
│ ┌── 任务 ──── [+ 新建] ────────────────────┐│
│ │ ☐ 序号  任务名称                   [删除] ││
│ │ ☑ 序号  已完成任务                  [删除] ││
│ └──────────────────────────────────────────┘│
│ ┌── 文件 ──── [+ 上传] ───────────────────┐│
│ │ 📄 文件名                    上传时间     ││
│ └──────────────────────────────────────────┘│
└────────────────────────────────────────────┘
```

## 7. 禅道看板页

独立页面，顶部刷新按钮，点击后调用 `mcp_zentao-bug_getMyBugs` 获取 Bug 列表，按标题 `【XXX】` 前缀分组展示。

每组展示：
- 组标题（【XX】提取的产品名）
- Bug 列表：标题、优先级、状态

## 8. 技术选型

- 存储：JSON 文件（`ctx.dataDir`），无外部依赖
- 前端：Direct 模板（无构建），原生 HTML/CSS/JS
- 路由：插件 `routes/ui.js`，支持 `/page` 主页和 `/page/project/:id` 子页
- 禅道：复用已有 `mcp_zentao-bug` 工具

## 9. 开发计划

1. 实现数据层：JSON 读写 + 数据结构
2. 实现 Agent 工具：project-set / project / task / zentao
3. 实现页面：主页（左右分栏）→ 详情页 → 禅道看板
4. 安装测试 + 联调
