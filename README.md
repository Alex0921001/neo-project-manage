# neo-project-manage（项目管理）

面向 Agent 与用户的项目与任务管理工具。支持项目集、项目、树形任务、批注（便利贴）、文件引用、项目备注、方案管理、需求管理、统一评论、版本管理、验证模块、临时任务、任务日历、自动总结、风险识别与周报生成的完整闭环，五大模块（需求/方案/评论/验证/临时任务）提供批量操作能力。

> 当前版本：**V2.6.2**（五大模块批量操作）

## 快速使用

### 用户（页面操作）

1. 创建项目集 → 创建项目 → 创建任务（支持任意层级子任务）
2. 任务可分配成员、起止日期；便利贴（批注）记录备注/决策/风险/节点
3. 项目概览面板自动生成：KPI 统计、风险识别、下一步建议、历史总结时间线
4. **需求管理**：新建/编辑需求，三态流转（待处理→已完成/已取消），支持排序、搜索、状态筛选、分页；需求可关联方案
5. **方案管理**：新建/克隆/编辑方案，支持评论、一键转任务、状态流转（草稿→进行中→已采纳/已废弃）、双向关联需求与任务；可从文件导入（txt / md / docx）快速成稿
6. **一键周报**：概览页「一键生成周报/阶段总结」，按本周/上周/近 7 天/自定义范围生成 Markdown（完成项/进行中/风险/下周建议）
7. **详情弹窗**：需求/方案/任务详情右上导航（上一条/下一条），点击列表行预览、编辑/删除在弹窗内
8. **页面持久化**：tab 顺序与显隐、搜索词、排序方式自动记忆；需求/方案状态筛选同样持久化（刷新恢复上次筛选）
9. **消息中心**：项目集条右上角铃铛 + 未读角标；弹窗左列表（20 条/页滚动加载）右详情；到期提醒（提前 N 天可配置）与风险提醒（仅非归档 + 进行中/待开始项目的中高级风险）**聚合消息**（同类每日一条不轰炸）；搜索高亮 / 右键删除 / 一键已读 / 提醒配置（提前天数 + 开关）
10. **全文检索**：三入口（项目内放大镜 / 项目集条放大镜 / Ctrl+F）；FTS5 中文检索（3 字以上 trigram，1~2 字模糊匹配）；结果按类型分组（项目/任务/批注/方案/需求/备注/文件）卡片展示，命中词琥珀高亮，点击跳转原文；首次建索引有动效提示
11. **日历弹窗**：列表页「前往日历」（全项目）与详情页任务 tab「前往日历 >」（单项目）均为弹窗，可拖动缩放
12. **风险规则配置**：概览页「风险」标题旁齿轮，6 条规则按项目级配置开关 / 阈值 / 等级；跨项目风险汇总仅统计非归档 + 进行中/待开始项目，仅中高级别
11. 项目可 ⭐ 收藏置顶；任务可设等级（P0~P5）；成员统一管理（⚙ 人员管理）；任务可标里程碑（旗帜）自动汇聚步骤条
12. 审计追踪：所有写操作留痕（时间/行为/目标/变更内容），支持行为与时间范围筛选
13. 项目可归档（非进行中）或标记已取消；已归档项目可在「已归档」分组查看/恢复

### Agent（工具调用）

所有工具以 `neo-project-manage_` 为前缀，输入输出为 JSON。典型链路：

```
1. list_project_sets / list_projects        → 找到项目 ID
2. get_project { id }                        → 项目详情（任务树/批注/文件/归档状态）
3. list_tasks { projectId }                  → 任务列表
4. summarize_project { projectId }           → 自动总结（风险/下一步）
5. get_project_risks { projectId }           → 只读风险 JSON（不存档）
6. ask_project { projectId, scope }          → 问答编排（summary/risks/decisions/timeline/files/requirements/plans）
7. create_task / create_annotation ...       → 落地新任务/便利贴
8. create_plan { projectId, title, content } → 创建方案
9. search_all { keyword } → 全局/项目内全文检索（分组结果 + 命中片段）
10. list_messages { } / get_message_config { } → 消息中心 / 提醒配置
```

## 工具清单（123 个）

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
| `create_plan` | 创建方案（标题 + 富文本内容 + 可选关联需求）|
| `create_requirement` | 创建需求（名称/简述/优先级/关联方案）|
| `create_note` | 添加项目备注 |
| `create_verification` | 创建验证卡（名称 + 关联任务多选 + 备注）|
| `add_verification_item` | 给验证卡新增验证项 |
| `quick_task_add` | 新增临时任务（随手记，不关联项目）|

### 更新

| 工具 | 说明 |
| --- | --- |
| `update_project_set` | 重命名项目集 |
| `update_project` | 编辑项目（名称/描述/成员/时间/状态/归档/收藏）|
| `update_task` | 编辑任务（改名/成员/日期/等级/里程碑/标记完成）|
| `update_tasks` | **批量更新任务**（最多 50 个，逐条独立校验，单条失败不影响其他，返回成功/失败清单）|
| `update_annotation` | 编辑便利贴内容 / 类型 / 确认状态 |
| `update_annotations` | **批量更新便利贴**（最多 50 个，逐条独立校验；已完成任务冻结条目标记失败）|
| `update_member` | 成员改名 |
| `update_plan` | 编辑方案（标题/内容/状态/关联需求/关联任务，含业务校验）|
| `update_requirement` | 编辑需求（仅待处理：名称/简述/优先级/关联方案）|
| `update_requirement_status` | 需求三态流转（待处理/已完成/已取消，自由互转）|
| `update_note` | 编辑项目备注 |
| `update_verification` | 编辑验证卡（名称/关联任务/备注）|
| `update_verification_item` | 编辑验证项（内容/分类/备注）|
| `toggle_verification_item` | 勾选/退回验证项（打勾落库：写勾选时间/操作人 + 审计）|
| `quick_task_update` | 更新临时任务（编辑内容 / 标记完成 / 退回）|
| `update_comment` | 编辑统一评论（需求/方案通用，保留「已编辑」标记）|
| `restore_version` | 还原需求/方案到指定历史版本（版本链不断）|

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
| `delete_requirement` | 删除需求（已完成禁止删除，级联清关联）|
| `delete_verification` | 删除验证卡（级联删卡内验证项，审计留痕）|
| `delete_verification_item` | 删除验证项（内容快照审计）|
| `quick_task_delete` | 删除临时任务（未完成/已完成/已转化均可直删）|
| `quick_task_archive` | 归档临时任务（单条/批量/全部已完成已转化）|
| `delete_comment` | 删除统一评论（删除留审计）|
| `delete_project_file` | 删除文件登记（不影响磁盘文件）|
| `delete_project_folder` | 删除文件夹（真删除：递归删子孙夹+文件登记，磁盘不碰）|
| `delete_note` | 删除项目备注 |

### 查询

| 工具 | 说明 |
| --- | --- |
| `list_project_sets` | 项目集列表（含项目数）|
| `list_projects` | 项目列表（keyword / projectSetId 筛选，含统计与归档标记）|
| `get_project` | 项目详情（任务树/批注/文件/备注/归档/会话全字段）|
| `list_tasks` | 任务列表（status/assignee/keyword/dateRange 筛选）|
| `get_task` | 按 ID 全局查任务（短前缀/完整 ID，含父任务/批注/子任务/完成时间/关联文件与方案）|
| `list_annotations` | 便利贴列表（**taskId 单任务 或 projectId 项目级**，可 kind/keyword 筛选）|
| `list_project_files` | 项目文件资产清单（folderId/name 筛选，含大小/摘要/索引）|
| `get_project_file` | 单个文件详情 |
| `register_project_file` | 登记文件资产（可选 folderId 指定目录）|
| `move_project_file` | 移动文件登记到文件夹（空=根目录）|
| `read_project_file` | 读取文件内容（txt 直读/docx 提取/pdf 文本/图片报错）|
| `create_project_folder` / `update_project_folder` | 新建/编辑文件夹（改名+换父级，防环+同级重名）|
| `list_project_sessions` | 关联会话列表 |
| `get_project_summaries` | 项目历史总结（最近 N 条）|
| `summarize_project` | 项目自动总结（完成度/风险/下一步，触发存档）|
| `get_project_risks` | 只读 6 条规则计算后的风险 JSON（附配置，不存档）|
| `list_project_risks` | 跨项目风险汇总（按项目集范围）|
| `generate_report` | **一键生成周报/阶段总结**（本周/上周/近 7 天/自定义，Markdown：完成项/进行中/风险/建议）|
| `ask_project` | 项目问答编排（scope: summary/risks/decisions/timeline/files/requirements/plans/all）|
| `list_members` | 成员列表（all-known 模式聚合历史人名，带 isHistoric）|
| `list_audit_logs` | 审计日志（项目级，limit/offset/dateFrom/dateTo/targetType 筛选）|
| `list_plans` | 方案列表（分页/id 精确/标题关键字/状态筛选）|
| `get_plan` | 方案详情（含评论）|
| `list_requirements` | 需求列表（分页/状态/关键字/id 筛选）|
| `get_requirement` | 需求详情（含关联方案明细）|
| `list_messages` | 消息列表（20 条/页分页，先扫描生成再返回；type/projectId 过滤）|
| `get_message_unread_count` | 未读消息计数 |
| `get_message_config` | 提醒配置（提前天数/到期开关/风险开关）|
| `update_message_config` | 修改提醒配置（deadlineDays 1~14、deadlineEnabled、riskEnabled）|
| `search_all` | **全文检索**（keyword/projectId 限定/type 过滤/limit；3 字以上 FTS5，1~2 字 LIKE 兜底；返回分组结果 + snippet 命中片段 + fullIndexed 状态）|
| `delete_message` | 删除消息 |
| `mark_message_read` | 标记消息已读（ids 数组，≤50）|

### 会话关联 / 方案扩展

| 工具 | 说明 |
| --- | --- |
| `link_project_session` | 关联会话到项目（重复自动去重）|
| `unlink_project_session` | 解除会话关联 |
| `add_plan_comment` | 给方案加评论 |
| `convert_plan_to_task` | 已采纳方案一键转任务（任务名=方案标题，内容=方案内容）|
| `link_requirement_plans` / `unlink_requirement_plans` | 需求↔方案关联 / 解除 |
| `confirm_annotations` | 批量确认便利贴（ids/taskId/项目三范围）|
| `import_plan_file` | 导入 txt/md/docx 成方案（预览或 autoCreate）|

### 批量操作（V2.6.2，19 个）

统一范式：批量新增 = 事务包裹整体回滚（对齐 `create_tasks`）；批量编辑/删除/流转 = 逐条独立校验（对齐 `update_tasks`），单条失败不影响其他条，返回成功/失败清单及原因；items 上限 50。

| 模块 | 工具 | 说明 |
| --- | --- | --- |
| 需求 | `create_requirements` `update_requirements` `update_requirement_statuses` `delete_requirements` | 批量新建 / 批量编辑（仅待处理可改逐条生效）/ 批量三态流转 / 批量删除（已完成不可删逐条生效）|
| 方案 | `create_plans` `update_plans` `delete_plans` | 批量新建 / 批量编辑与流转（状态冻结逐条生效，内容变更自动存版本）/ 批量删除（仅草稿已废弃可删，级联删评论）|
| 评论 | `add_comments` `update_comments` `delete_comments` | 同目标批量加评论（支持划词引用透传）/ 批量编辑 / 批量删除 |
| 验证 | `create_verifications` `create_verification_items` `update_verification_items` `toggle_verification_items` `delete_verification_items` `delete_verifications` | 批量建卡 / 单卡批量灌检查项 / 批量编辑 / 批量勾选退回（目标态 + 幂等，逐条审计）/ 批量删项 / 批量删卡 |
| 临时任务 | `create_quick_tasks` `update_quick_tasks` `delete_quick_tasks` | 批量随手记 / 批量完成退回编辑 / 批量删除（归档态防呆）|

### 临时任务（V2.5）

| 工具 | 说明 |
| --- | --- |
| `quick_task_list` | 临时任务列表（status/keyword 筛选，归档态分页）|
| `quick_task_add` / `quick_task_update` / `quick_task_delete` | 随手记新增 / 编辑与完成退回 / 删除 |
| `quick_task_archive` | 归档（单条 / ids 批量 / all=true 全部已完成已转化）|
| `quick_task_convert` | 转正式任务（事务内建任务 + 回写转化去向，任一步失败整体回滚）|

### 验证模块（V2.6）

| 工具 | 说明 |
| --- | --- |
| `list_verifications` / `get_verification` | 验证卡列表（分页/搜索） / 详情（关联任务与方案 + 完成进度）|
| `create_verification` / `update_verification` / `delete_verification` | 验证卡增改删（删除级联删项）|
| `list_verification_items` / `add_verification_item` / `update_verification_item` / `toggle_verification_item` / `delete_verification_item` | 卡内验证项增删改查 + 勾选退回落库（写勾选时间/操作人 + 审计），进度按项完成度计算 |
| `list_verification_categories` / `create_verification_category` / `rename_verification_category` / `delete_verification_category` / `clear_verification_group` | 验证分类字典（新项目预置三分类；改名自动同步项；删分类项归入通用组；按组清空验证项）|

### 统一评论与版本管理（V2.6）

| 工具 | 说明 |
| --- | --- |
| `list_comments` | 统一评论列表（需求/方案共用一表，targetType 过滤，项目级全览）|
| `add_comment` / `update_comment` / `delete_comment` | 评论增改删（支持划词引用 quoteText/quoteAnchor；编辑保留已编辑标记；删除带内容快照审计）|
| `list_versions` / `restore_version` / `set_version_label` | 需求/方案版本快照：查询（新→旧，保留 50 版）/ 还原（旧内容存为新版本）/ 重要备注标记 |

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

// 创建需求并关联方案（已采纳）
create_requirement { "projectId": "xxx", "name": "需求A", "priority": "P1", "planIds": ["已采纳方案ID"] }

// 一键生成周报（近 7 天）
generate_report { "projectId": "xxx", "range": "last7days" }

// 批量更新任务（逐条独立，返回成功/失败清单）
update_tasks { "projectId": "xxx", "tasks": [{ "id": "t1", "priority": "P1" }, { "id": "t2", "done": true }] }

// 批量新建需求（事务包裹：任一条失败整体回滚）
create_requirements { "projectId": "xxx", "items": [{ "name": "需求A", "priority": "P1" }, { "name": "需求B" }] }

// 批量勾选验证项（done 为目标态，幂等）
toggle_verification_items { "projectId": "xxx", "items": [{ "id": "v1", "done": true }, { "id": "v2", "done": true }] }

// 同目标批量加评论
add_comments { "projectId": "xxx", "targetType": "plan", "targetId": "方案ID", "items": [{ "content": "意见一" }, { "content": "意见二" }] }

// 批量确认便利贴（项目全部未确认）
confirm_annotations { "projectId": "xxx" }

// 任务全局查询（短前缀即可）
get_task { "taskId": "a1b2" }

// 归档项目
update_project { "id": "xxx", "archived": true }

// 搜索任务（按名称/描述/批注内容）
list_tasks { "projectId": "xxx", "keyword": "登录" }

// 任务标为里程碑 + 标记完成（需全部便利贴已确认）
update_task { "projectId": "xxx", "id": "任务ID", "isMilestone": true }
update_task { "projectId": "xxx", "id": "任务ID", "done": true }

// 全文检索（全局；项目内搜加 projectId）
search_all { "keyword": "知识库" }

// 消息中心 / 提醒配置
list_messages { "limit": 20 }
update_message_config { "deadlineDays": 7, "riskEnabled": true }

// 审计追踪（时间范围筛选）
list_audit_logs { "projectId": "xxx", "dateFrom": "2026-08-01", "dateTo": "2026-08-31" }
```

> **便利贴互斥规则**：任务已完成 → 不能挂载 / 修改 / 取消确认便利贴（冻结，删除放行）；任务完成前置 → 该任务全部便利贴须已确认。规则在工具与 REST 同时生效。

> **任务完成前置校验**：任务已完成 → 便利贴全部须已确认；父任务完成 → 全部子任务须已完成（子任务未完成拦截）。

> **方案状态规则**：编辑标题/内容仅草稿/进行中；已转任务且任务存在时状态冻结（任务删除后可回退）；删除仅草稿/已废弃。

> **任务关联方案规则**：任务只能关联**已采纳**的方案（前后端一致拦截）；需求关联方案不限状态。

> **周报口径**：完成项按完成时间（done_at）落在区间内（老数据无 done_at 不统计）；进行中=当前全部未完成任务（快照）；风险/建议沿用 6 条风险规则。

> **消息提醒口径**：到期提醒 = 未完成任务 endDate 在「今天 ~ 今天+N 天」（N=配置提前天数，默认 3），同类每日聚合一条；风险提醒 = 仅**非归档 + 进行中/待开始**项目，且仅**中高级别**风险，每日聚合一条；历史消息保留，删除仅手动。

> **风险统计口径**：`list_project_risks` 仅统计非归档 + 进行中/待开始项目，仅中高级别风险（low 不入列不计数）。

## 数据存储

- SQLite（better-sqlite3，原生绑定 vendor 在 `lib/vendor/`），WAL 模式 + 外键级联
- 位置：`ctx.dataDir/projects.sqlite`（卸载插件不删数据）
- schema 版本 **12**，启动自动幂等迁移（老数据兼容）+ 悬空引用自愈（plans.task_id / requirement_plans / task_plans）
- 表：projects / project_sets / tasks（自引用）/ files / file_folders / task_file_refs / notes / annotations / members / audit_logs / plans / plan_comments / comments / requirements / requirement_plans / task_plans / project_summaries / risk_config / messages / fts_entries / fts_dirty / fts_meta / settings / schema_meta / versions / verifications / verification_items / verification_categories / quick_tasks

## 开发指南

- **新增工具**：`tools/` 下新建文件，导出 `name / description / parameters(JSON Schema) / execute(input, toolCtx)`，并在 `manifest.json` 注册；`toolCtx.dataDir` 拿数据访问
- **新增路由**：`routes/modules/` 下新建文件，导出 `registerXxxRoutes(app, data)`，到 `routes/ui.js` import 注册；静态路径先于 `:id` 动态路由
- **新增数据访问**：`lib/data.js` 的 `createDataAccess(dataDir)` 内写函数并加入 return 导出；错误用 `throw new Error`，写入用事务，ID 用 `shortId()`
- **测试**：`node --test scripts/test/*.test.mjs`（104 项：数据层/工具层/方案导入/任务方案关联/消息/全文检索/配置/五模块批量操作）；拦截规则回归：`node scripts/smoke-intercept-check.mjs`；本机 Node 跑测试需 `NVM_SKIP_VENDOR=1`（vendor 原生模块为 Hana 宿主 ABI 编译）
