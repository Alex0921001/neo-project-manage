# neo-project-manage（项目管理）

面向 Agent 与用户的项目与任务管理工具。支持项目集、项目、树形任务、批注（便利贴）、文件引用、项目备注、方案管理、任务日历、自动总结与风险识别的完整闭环。

> 当前版本：**V2.1.1**（方案管理 · 方案文件导入 · 日历弹窗化 · 风险规则配置化 · 风险批注聚合 · 项目卡片统计增强）

## 快速使用

### 用户（页面操作）

1. 创建项目集 → 创建项目 → 创建任务（支持任意层级子任务）
2. 任务可分配成员、起止日期；便利贴（批注）记录备注/决策/风险/节点
3. 项目概览面板自动生成：KPI 统计、风险识别、下一步建议、历史总结时间线
4. **方案管理**：新建/克隆/编辑方案，支持评论、一键转任务、状态流转（草稿→进行中→已采纳/已废弃）；可从文件导入（txt / md / docx）快速成稿
5. **日历弹窗**：列表页「前往日历」（全项目）与详情页任务 tab「前往日历 >」（单项目）均为弹窗，可拖动缩放
6. **风险规则配置**：概览页「风险」标题旁齿轮，7 条规则按项目级配置开关 / 阈值 / 等级
7. 项目可 ⭐ 收藏置顶；任务可设等级（P0~P5）；成员统一管理（⚙ 人员管理）
8. 任务可标为里程碑（旗帜），里程碑任务自动汇聚成步骤条时间轴
9. 审计追踪：所有写操作留痕（时间/行为/目标/变更内容），支持行为与时间范围筛选
10. 项目可归档（非进行中）或标记已取消；已归档项目可在「已归档」分组查看/恢复

### Agent（工具调用）

所有工具以 `neo-project-manage_` 为前缀，输入输出为 JSON。典型链路：

```
1. list_project_sets / list_projects        → 找到项目 ID
2. get_project { id }                        → 项目详情（任务树/批注/文件/归档状态）
3. list_tasks { projectId }                  → 任务列表
4. summarize_project { projectId }           → 自动总结（风险/下一步）
5. get_project_risks { projectId }           → 只读风险 JSON（不存档）
6. ask_project { projectId, scope }          → 问答编排（summary/risks/decisions/timeline/files）
7. create_task / create_annotation ...       → 落地新任务/便利贴
8. create_plan { projectId, title, content } → 创建方案
```

## 工具清单（47 个）

### 创建

| 工具 | 说明 |
| --- | --- |
| `create_project_set` | 创建项目集 |
| `create_project` | 创建项目（名称/描述/成员/时间/状态/归属）|
| `create_task` | 创建任务（支持父任务/成员/起止日期/等级/里程碑）|
| `create_tasks` | 批量创建任务（最多 50 个，事务包裹）|
| `create_annotation` | 给任务加便利贴（kind: note/decision/risk/milestone）|
| `create_annotations` | 批量创建便利贴（最多 50 个）|
| `create_member` | 创建成员（全局成员表，name 唯一）|
| `create_plan` | 创建方案（标题 + 富文本内容）|
| `create_note` | 添加项目备注 |

### 更新

| 工具 | 说明 |
| --- | --- |
| `update_project_set` | 重命名项目集 |
| `update_project` | 编辑项目（名称/描述/成员/时间/状态/归档/收藏）|
| `update_task` | 编辑任务（改名/成员/日期/等级/里程碑/标记完成）|
| `update_annotation` | 编辑便利贴内容 / 类型 / 确认状态 |
| `update_member` | 成员改名 |
| `update_plan` | 编辑方案（标题/内容/状态，含业务校验）|
| `update_note` | 编辑项目备注 |

### 删除

| 工具 | 说明 |
| --- | --- |
| `delete_project_set` | 删除项目集（集下有项目时拒绝）|
| `delete_project` | 删除项目（含已完成任务时拒绝）|
| `delete_task` / `delete_tasks` | 删除任务（父任务级联删子任务）/ 批量 |
| `delete_annotation` / `delete_annotations` | 删除便利贴 / 批量 |
| `delete_member` | 删除成员 |
| `delete_plan` | 删除方案（仅草稿/已废弃，级联删评论）|
| `delete_plan_comment` | 删除方案评论 |
| `delete_note` | 删除项目备注 |

### 查询

| 工具 | 说明 |
| --- | --- |
| `list_project_sets` | 项目集列表（含项目数）|
| `list_projects` | 项目列表（keyword / projectSetId 筛选，含统计与归档标记）|
| `get_project` | 项目详情（任务树/批注/文件/备注/归档/会话全字段）|
| `list_tasks` | 任务列表（status/assignee/keyword/dateRange 筛选）|
| `get_task` | 按 ID 全局查任务（含父任务/批注类型/子任务）|
| `list_annotations` | 便利贴列表（**taskId 单任务 或 projectId 项目级**，可 kind/keyword 筛选）|
| `list_project_files` | 项目文件资产清单（含路径/大小/摘要/索引）|
| `get_project_file` | 单个文件详情 |
| `list_project_sessions` | 关联会话列表 |
| `get_project_summaries` | 项目历史总结（最近 N 条）|
| `summarize_project` | 项目自动总结（完成度/风险/下一步，触发存档）|
| `get_project_risks` | 只读 7 条规则计算后的风险 JSON（附配置，不存档）|
| `ask_project` | 项目问答编排（scope: summary/risks/decisions/timeline/files/all）|
| `list_members` | 成员列表（all-known 模式聚合历史人名，带 isHistoric）|
| `list_audit_logs` | 审计日志（项目级，limit/offset/dateFrom/dateTo/targetType 筛选）|
| `list_plans` | 方案列表（分页/标题关键字/状态筛选）|
| `get_plan` | 方案详情（含评论）|

### 会话关联 / 方案扩展

| 工具 | 说明 |
| --- | --- |
| `link_project_session` | 关联会话到项目（重复自动去重）|
| `unlink_project_session` | 解除会话关联 |
| `add_plan_comment` | 给方案加评论 |
| `convert_plan_to_task` | 已采纳方案一键转任务（任务名=方案标题，内容=方案内容）|

## 关键用法示例

```jsonc
// 创建子任务
create_task { "projectId": "xxx", "name": "子任务", "parentTaskId": "父任务ID" }

// 项目级查询便利贴
list_annotations { "projectId": "xxx", "kind": "decision" }

// 自动总结 + 风险识别
summarize_project { "projectId": "xxx" }

// 只读风险（JSON，不触发存档）
get_project_risks { "projectId": "xxx" }

// 创建方案并转任务
create_plan { "projectId": "xxx", "title": "方案A", "content": "<p>要点</p>" }
convert_plan_to_task { "projectId": "xxx", "planId": "方案ID" }

// 归档项目
update_project { "id": "xxx", "archived": true }

// 搜索任务（按名称/描述/批注内容）
list_tasks { "projectId": "xxx", "keyword": "登录" }

// 任务标为里程碑 + 标记完成（需全部便利贴已确认）
update_task { "projectId": "xxx", "id": "任务ID", "isMilestone": true }
update_task { "projectId": "xxx", "id": "任务ID", "done": true }

// 审计追踪（时间范围筛选）
list_audit_logs { "projectId": "xxx", "dateFrom": "2026-08-01", "dateTo": "2026-08-31" }
```

> **便利贴互斥规则**：任务已完成 → 不能挂载 / 修改 / 取消确认便利贴（冻结，删除放行）；任务完成前置 → 该任务全部便利贴须已确认。规则在工具与 REST 同时生效。

> **方案状态规则**：编辑标题/内容仅草稿/进行中；已转任务且任务存在时状态冻结（任务删除后可回退）；删除仅草稿/已废弃。

## 数据存储

- SQLite（better-sqlite3，原生绑定 vendor 在 `lib/vendor/`），WAL 模式 + 外键级联
- 位置：`ctx.dataDir/projects.sqlite`（卸载插件不删数据）
- schema 版本 **8**，启动自动幂等迁移（老数据兼容；risk_config 等新列为幂等补列）
- 表：projects / project_sets / tasks（自引用）/ files / task_file_refs / notes / annotations / members / audit_logs / plans / plan_comments / project_summaries / schema_meta

## 开发指南

- **新增工具**：`tools/` 下新建文件，导出 `name / description / parameters(JSON Schema) / execute(input, toolCtx)`，并在 `manifest.json` 注册；`toolCtx.dataDir` 拿数据访问
- **新增路由**：`routes/modules/` 下新建文件，导出 `registerXxxRoutes(app, data)`，到 `routes/ui.js` import 注册；静态路径先于 `:id` 动态路由
- **新增数据访问**：`lib/data.js` 的 `createDataAccess(dataDir)` 内写函数并加入 return 导出；错误用 `throw new Error`，写入用事务，ID 用 `shortId()`
- **测试**：`node scripts/test/data.test.mjs`（数据层）+ `node scripts/test/tools.test.mjs`（工具层）+ `node scripts/test/plan-import.test.mjs`（文件解析）

## 版本历史

| 版本 | 日期 | 要点 |
| --- | --- | --- |
| V2.1.1 | 2026-08-13 | 方案管理全量落地 + 文件导入（txt/md/docx）· 日历统一弹窗 · 风险规则配置化（项目级）· 风险批注聚合 + 类别排序 · get_project_risks 工具 · 审计筛选 · 备注三工具 · 批注定位高亮/全部任务/关键字搜索 · 项目卡片方案数 + 项目集名（工具 47）|
| V2.1.0 | 2026-08-12 | 收藏置顶 · 任务等级 P0~P5 · 功能速查弹窗（右下角 ?）· 成员管理 · 任务里程碑 + 步骤条 · 批注消费（milestone 标签 / risk 纳入总结）· 审计追踪（分页 + 中文翻译）· 便利贴互斥规则（schema v7）|
| V2.0.0 | 2026-08-11 | 批注类型化（决策/风险/节点）· 文件资产化 · 会话关联 · 自动总结 + 风险识别 · 概览面板 · 历史时间线 · 批注管理大屏 · 已取消状态 + 项目归档（schema v6）· 后续精修：KPI 半透明/hover 淡化、nextSteps 状态分支、查询工具字段补齐、list_annotations 项目级查询 |
| V1.3.1 | 2026-08-10 | 项目集拖拽排序持久化 · 嵌套任务状态同步 · 子任务日期范围 · 错误提示拦截（ElMessage）· 卡片精修 |
| V1.3.0 | 2026-08-09 | 便利贴式项目卡片 · 项目集顶部 tabs · 详情页改造 · 任务日历 tab |
| V1.2.0 | 2026-08-07 | 任务成员 + 起止时间 · 任务日历 · 富文本（base64 内联图片）· Element Plus 弹窗 |
| V1.0.1 | 2026-08-02 | 批量批注工具/路由 · list_tasks/list_projects keyword 搜索 |
| V1.0.0 | - | 初始版本：完整 CRUD + SQLite 存储 |
