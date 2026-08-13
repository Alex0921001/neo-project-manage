# 项目管理 · 功能速查

项目管理插件为 **Agent 与人工** 双端提供项目全生命周期管理：项目集分组、树形任务、批注（便利贴）、文件资产（多级文件夹）、方案管理、需求管理、分析总结与会话关联。人工端在「项目管理」页面操作，Agent 端通过 63 个工具读写数据，两侧数据实时互通。

---

## v2.1.4 当前版本

### 本次新增

| 能力 | 说明 |
| --- | --- |
| 文件系统重构 | `file_folders` 表多层嵌套（parent_id 自引用）+ `files.folder_id`；左侧文件夹树 + 右侧网格视图；新建/重命名（同级重名校验）/ 拖拽换父级（防环）/ 删除（内容提升，不级联删）；文件名称搜索 + 文件夹过滤；Ctrl/Shift 多选 + Delete 批量删除；路径失效角标；工具 59→63 |
| 新工具 ×4 | `create_project_folder` / `update_project_folder`（改名+换父级）/ `delete_project_folder`（内容提升）/ `read_project_file`（txt 直读、docx 提取、pdf FlateDecode 文本提取、图片/未登记报错） |
| 需求页样式对齐 | 需求 tab 工具栏统一上移至 index.vue（搜索/筛选复用 `.task-search`/`.plan-status-select`）；列表行/空态/分页/弹窗对齐 PlanTab；优先级徽标复制 TaskCard 染色；搜索命中高亮；修复右上角「新建」按钮（defineExpose） |

### Agent 工具（63 个）

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 项目集 | `create_project_set` `update_project_set` `delete_project_set` `list_project_sets` | 项目集增删改查 |
| 项目 | `create_project` `update_project` `delete_project` `list_projects` `get_project` | 项目增删改查；update 支持归档/收藏；get 支持 `view=summary` 轻量模式 |
| 任务 | `create_task` `create_tasks` `update_task` `delete_task` `delete_tasks` `get_task` `list_tasks` | 树形任务增删改查；list 支持 `nearDeadlineDays` 临近截止筛选 |
| 批注 | `create_annotation` `create_annotations` `update_annotation` `delete_annotation` `delete_annotations` `list_annotations` `confirm_annotations` | 批注增删改查 + 批量确认（三范围） |
| 风险 | `get_project_risks` `list_project_risks` | 项目风险（读侧）与跨项目风险汇总 |
| 文件 | `list_project_files` `get_project_file` `register_project_file` `create_project_folder` `update_project_folder` `delete_project_folder` `read_project_file` | 项目文件资产清单 / 详情 / 登记；多级文件夹管理（建/改/删，删除提升）；文件内容提取（txt/docx/pdf） |
| 成员 | `list_members` `create_member` `update_member` `delete_member` | 全局成员管理 |
| 会话 | `link_project_session` `list_project_sessions` `unlink_project_session` | 项目与会话双向关联 |
| 总结 | `summarize_project` `ask_project` `get_project_summaries` | 项目总结 / 问答 / 历史总结 |
| 方案 | `create_plan` `update_plan` `delete_plan` `list_plans` `get_plan` `add_plan_comment` `delete_plan_comment` `convert_plan_to_task` `import_plan_file` | 方案全生命周期 + 文件导入 |
| 需求 | `create_requirement` `update_requirement` `update_requirement_status` `delete_requirement` `list_requirements` `get_requirement` `link_requirement_plans` `unlink_requirement_plans` | 需求增删改查 + 三态流转 + 方案双向挂载 |
| 备注 | `create_note` `update_note` `delete_note` | 项目备注管理 |
| 审计 | `list_audit_logs` | 审计日志查询（行为/类型/关键词/时间筛选，分页） |

### 项目管理

| 模块 | 能力 |
| --- | --- |
| 项目集 | 分组管理、拖拽排序、右键菜单增删改；集下还有项目时禁止删除 |
| 项目 | 增删改查；成员、起止日期、状态流转（待开始 / 进行中 / 已完成 / 已取消）；归档与恢复；收藏置顶 |
| 树形任务 | 父子孙多级结构，删除父任务**级联删除**子孙；批量创建（≤50 条，中途失败整体回滚）；编辑支持改父任务；等级 P0~P5；里程碑旗帜标记；三种排序模式（默认可拖拽 / 时间 / 等级） |
| 多级文件夹 | file_folders 无限层级树 + 文件归属；新建/重命名（同级重名校验）/ 拖拽换父级（防环）/ 删除内容提升；文件夹与文件名称搜索；Ctrl/Shift 多选 + Delete 批量删除 |
| 方案 | 标题 + 富文本内容；状态流转与业务校验（已转任务冻结）；评论；一键转任务；文件导入（txt/md/docx）；反向展示满足的需求 |
| 需求 | 三态流转（待处理→已完成/已取消，冻结）；优先级 P0~P5；需求↔方案多对多双向挂载；筛选/搜索/分页 |
| tab 栏 | 7 tab 数据驱动 + 拖拽调序 + 右键设置；项目级 > 全局级 > 默认顺序 |
| 批注（便利贴） | 四类：`note` 备注 / `decision` 决策 / `risk` 风险 / `milestone` 节点；待确认 / 已确认两种状态；任务级与项目级筛选；批注管理大屏（可折叠任务树 + 全部任务视图 + 关键字搜索）；已完成任务冻结（不可挂载/修改，可删除） |
| 成员 | 全局成员表（name 唯一）；项目/任务人员下拉统一走成员体系，支持快捷新增与管理 |
| 里程碑步骤条 | 有里程碑的任务自动生成时间轴：项目起止端点 + 旗子节点 + 批注标签（前 10 字），popover 展示全部里程碑 |
| 审计追踪 | 所有写操作记录（创建/更新/删除，含新旧值）；行为 + 时间范围筛选；变更字段自动翻译成业务语言 |

### 分析能力

| 能力 | 说明 |
| --- | --- |
| 自动总结 | 任务/批注/备注多维汇总，含进度、风险、待确认、延期、下一步建议；数据实时生成 |
| 风险识别 | 7 条规则（项目无起止日期、任务延期/临近截止/无日期/无负责人、批注无确认等），可**项目级配置**开关/阈值/等级，批注风险**聚合展示** + 类别排序 |
| 风险汇总 | `list_project_risks` 跨项目风险汇总（按项目集范围），概览视图直接展示 |
| 历史时间线 | 按时间倒序回看历史总结，可筛选类型、点击查看全文 |

### 会话关联

项目可与 Hana 会话双向关联：Agent 在处理某个项目时把会话挂到项目下，会话上下文随项目沉淀；支持关联、查询、解除，重复关联自动去重，sessionId 有格式与长度校验。

---

## v2.1.3 历史能力

v2.1.3 建立的能力（v2.1.4 持续沿用）：

### 本次新增

| 能力 | 说明 |
| --- | --- |
| tab 栏配置化 | 7 tab 数据化（任务/需求/方案/文件/知识/备注/审计）· 拖拽调序（存全局）· 右键设置（Tab 设置/重置默认）· 设置弹窗三操作（取消/全局应用/本项目应用，确认后才生效）· 生效优先级 本项目 > 全局 > 默认 · 至少保留 1 个可见 |
| 需求管理 | requirements 表 + requirement_plans 多对多中间表；三态流转（待处理 → 已完成/已取消，已完成/已取消冻结）；需求 tab（筛选/搜索/分页/富文本简述/方案多选关联）；方案详情反向展示「满足的需求」；工具 51→59 |
| 方案评论折叠 | 方案详情右栏评论可折叠：展开态右上角圆形按钮 `>` 收起，折叠态小圆圈 `&lt;` 展开（纯前端） |
| 知识 tab 占位 | 知识入口默认显示，空态「知识沉淀规划中」，内容随 V2.2 填充 |

---

## v2.1.2 历史能力

v2.1.2 建立的能力（v2.1.3 持续沿用）：

### 本次新增

| 能力 | 说明 |
| --- | --- |
| 工具补齐至 51 | 新增 `confirm_annotations`（批量确认批注，ids/taskId/项目三范围）/ `register_project_file`（登记文件资产）/ `import_plan_file`（txt/md/docx 解析预览或 autoCreate 直建方案）/ `list_project_risks`（跨项目风险汇总，可指定项目集） |
| 查询输出增强 | `list_projects` 输出补方案数；`list_tasks` 支持 `nearDeadlineDays`（临近截止筛选）；`get_project` 支持 `view=summary` 轻量模式（跳过批注/文件/备注明细） |
| 任务排序 | 排序下拉（展开按钮左侧）：**默认排序**（可拖拽调整顺序）/ **时间排序**（开始时间升序，无日期排后）/ **等级排序**（P0→P5）；子任务/孙任务递归同规则；非默认排序**禁用拖拽**（把手灰显） |
| 内层任务定位修复 | 日历跳转内层任务（含孙任务）：祖先链强制展开后再滚动定位 + 琥珀闪烁，不再因未渲染而定位失败 |

---

## v2.1.1 历史能力

v2.1.1 建立的能力（v2.1.2 持续沿用）：

### 本次新增

| 能力 | 说明 |
| --- | --- |
| 方案管理 | 方案全生命周期：新建 / 克隆 / 编辑 / 评论 / 一键转任务 / 状态流转（草稿→进行中→已采纳/已废弃）；列表分页 + 标题筛选 + 状态筛选；右键菜单 |
| 方案文件导入 | 新建方案可从文件导入：**txt / md / docx**（标题取文件名，内容预填可修正），非三类类型拒绝 |
| 日历弹窗化 | 列表页「前往日历」（全项目）与详情页「前往日历 >」（单项目任务日历）统一为弹窗，可拖动缩放、随外框自适应 |
| 风险规则配置化 | 概览页「风险」标题旁齿轮：7 条风险规则按**项目级**配置开关 / 阈值 / 等级（默认=原规则），配置实时生效 |
| 风险批注聚合 | 风险批注从逐条提示改为**聚合一条**（N 条风险批注），点击气泡展示明细 + 已确认/待确认徽标 |
| 风险类别排序 | 风险条目按类别排列：**项目风险 → 任务风险 → 批注风险**（类内按等级），概览 / 工具输出一致 |
| 审计筛选 | 审计日志支持**行为 + 时间范围**筛选（右上角 tab 栏） |
| 项目卡片统计 | 卡片新增**方案数**，四项统计（任务/文件/备注/方案）hover 显示含义；日期行右侧显示项目集名称 |
| 批注增强 | 概览/里程碑点击**定位批注并高亮闪烁**；批注大屏「全部任务」视图 + 关键字搜索（琥珀高亮） |

### 项目管理

| 模块 | 能力 |
| --- | --- |
| 项目集 | 分组管理、拖拽排序、右键菜单增删改；集下还有项目时禁止删除 |
| 项目 | 增删改查；成员、起止日期、状态流转（待开始 / 进行中 / 已完成 / 已取消）；归档与恢复；收藏置顶 |
| 树形任务 | 父子孙多级结构，删除父任务**级联删除**子孙；批量创建（≤50 条，中途失败整体回滚）；编辑支持改父任务；等级 P0~P5；里程碑旗帜标记 |
| 方案 | 标题 + 富文本内容；状态流转与业务校验（已转任务冻结）；评论；一键转任务；文件导入（txt/md/docx） |
| 批注（便利贴） | 四类：`note` 备注 / `decision` 决策 / `risk` 风险 / `milestone` 节点；待确认 / 已确认两种状态；任务级与项目级筛选；批注管理大屏（可折叠任务树 + 全部任务视图 + 关键字搜索）；已完成任务冻结（不可挂载/修改，可删除） |
| 成员 | 全局成员表（name 唯一）；项目/任务人员下拉统一走成员体系，支持快捷新增与管理 |
| 里程碑步骤条 | 有里程碑的任务自动生成时间轴：项目起止端点 + 旗子节点 + 批注标签（前 10 字），popover 展示全部里程碑 |
| 审计追踪 | 所有写操作记录（创建/更新/删除，含新旧值）；行为 + 时间范围筛选；变更字段自动翻译成业务语言 |
| 文件 | 资产化登记：大小、类型、摘要（digest）；路径失效防御（文件被移动/删除不报错）；上传与桌面文件选取 |
| 多级文件夹 | file_folders 无限层级树；新建/重命名（同级重名校验）/ 拖拽换父级（防环）/ 删除内容提升；Agent 工具建/改/删；文件夹与文件名称搜索 |
| 备注 | 项目级备注，随项目详情查看与编辑 |
| 日历 | 全项目 / 单项目任务日历弹窗：按任务起止日期聚合，点击任务跳转定位 |

### 分析能力

| 能力 | 说明 |
| --- | --- |
| 概览面板 | 项目详情顶部折叠面板：KPI 四宫格（剩余/延期/待确认/缺日期）、风险清单（类别排序）、nextSteps 建议 |
| 自动总结 | `summarizeProject` 自动生成项目总结（进度 / 延期 / 风险 / nextSteps），支持 auto 与 manual 两种来源 |
| 风险识别 | 7 条内置规则（项目/任务/批注三类），**项目级可配置**开关 / 阈值 / 等级；风险批注聚合为一条；风险条目按类别排序 |
| 历史时间线 | 按时间倒序回看历史总结，可筛选类型、点击查看全文 |

### Agent 工具（47 个）

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 创建（9） | `create_project_set` | 创建项目集 |
| | `create_project` | 创建项目 |
| | `create_task` | 创建任务（支持父任务 / 等级 / 里程碑） |
| | `create_tasks` | 批量创建任务（≤50，事务回滚） |
| | `create_annotation` | 创建批注 |
| | `create_annotations` | 批量创建批注（≤50） |
| | `create_member` | 创建成员（全局，name 唯一） |
| | `create_plan` | 创建方案 |
| | `create_note` | 添加项目备注 |
| 更新（7） | `update_project_set` | 编辑项目集 |
| | `update_project` | 编辑项目（含收藏 pinned / 归档） |
| | `update_task` | 编辑任务（含等级 priority / 里程碑 / 完成状态） |
| | `update_annotation` | 编辑批注（含 kind / confirmed 确认） |
| | `update_member` | 成员改名 |
| | `update_plan` | 编辑方案（标题/内容/状态，业务校验） |
| | `update_note` | 编辑项目备注 |
| 删除（10） | `delete_project_set` | 删除项目集（有项目时拒绝） |
| | `delete_project` | 删除项目 |
| | `delete_task` | 删除任务（级联删除子孙） |
| | `delete_tasks` | 批量删除任务（级联） |
| | `delete_annotation` | 删除批注 |
| | `delete_annotations` | 批量删除批注 |
| | `delete_member` | 删除成员 |
| | `delete_plan` | 删除方案（仅草稿/已废弃） |
| | `delete_plan_comment` | 删除方案评论 |
| | `delete_note` | 删除项目备注 |
| 查询分析（17） | `list_project_sets` | 项目集列表 |
| | `list_projects` | 项目列表（含统计 / 收藏标记） |
| | `get_project` | 项目详情（任务树 / 文件 / 备注 / 批注 / 总结） |
| | `list_tasks` | 任务列表（关键词搜索，等级排序） |
| | `get_task` | 任务详情 |
| | `list_annotations` | 批注列表（任务级 / 项目级，类型筛选） |
| | `list_project_files` | 文件资产清单 |
| | `get_project_file` | 文件详情 |
| | `get_project_summaries` | 历史总结 |
| | `summarize_project` | 自动总结（进度 / 延期 / 风险 / nextSteps，触发存档） |
| | `get_project_risks` | 只读风险 JSON（7 条规则计算，附配置，不存档） |
| | `ask_project` | 项目问答（summary / risks / decisions / timeline / files / all） |
| | `list_members` | 成员列表（all-known 聚合历史人名） |
| | `list_audit_logs` | 审计日志（项目级，时间范围 / 行为 / 分页筛选） |
| | `list_plans` | 方案列表（分页 / 标题 / 状态筛选） |
| | `get_plan` | 方案详情（含评论） |
| 会话关联（2） | `link_project_session` | 项目关联 Hana 会话 |
| | `unlink_project_session` | 解除会话关联 |
| 方案扩展（2） | `add_plan_comment` | 给方案加评论 |
| | `convert_plan_to_task` | 已采纳方案一键转任务 |

### 会话关联

项目可与 Hana 会话双向关联：Agent 在处理某个项目时把会话挂到项目下，会话上下文随项目沉淀；支持关联、查询、解除，重复关联自动去重，sessionId 有格式与长度校验。

---

## v2.1.0 历史能力

v2.1.0 建立的能力（v2.1.1 持续沿用）：

| 能力 | 说明 |
| --- | --- |
| 项目收藏置顶 | 项目 ⭐ 收藏，同组内置顶展示 |
| 任务等级 P0~P5 | 按紧急程度分级，列表按 等级→开始时间→创建时间 排序 |
| 功能速查弹窗 | 右下角 `?` 按钮，运行时读取 docs/capabilities.md 渲染 |
| 成员管理 | 全局成员表统一管理，历史人名自动聚合补录 |
| 任务里程碑 | 🚩 旗帜标记，里程碑自动汇聚成步骤条时间轴 |
| 审计追踪 | 全部写操作留痕（时间/行为/目标/变更 old→new 中文翻译） |
| 便利贴互斥规则 | 已完成任务冻结便利贴；任务完成前置须全部便利贴已确认 |

---

## v2.0.0 历史能力

v2.0.0 建立的能力底座（持续沿用）：

| 能力 | 说明 |
| --- | --- |
| 批注便利贴体系 | 内联编辑、待确认 / 已确认状态、类型筛选、批注管理大屏 |
| 文件资产化 | 登记元信息（大小 / 类型 / 摘要），路径失效防御 |
| 会话关联 | 项目 ↔ 会话绑定（link / list / unlink） |
| 自动总结与风险识别 | 进度 / 延期 / 风险 / nextSteps 规则引擎 |
| 历史时间线 | 总结持久化、按时间倒序回看 |
| 项目问答 | `ask_project` 按 scope 输出总结 / 风险 / 决策 / 时间线 / 文件 |
| 项目归档与已取消 | 状态流转闭环，归档项目撒花缺省态 |
| 日历视图 | 按起止日期聚合任务的项目日历 |
| 任务搜索 | 关键词命中任务名 / 描述 / 批注内容 |
| 成员契约与日期校验 | 非法成员 / 非法日期拒绝，日期越界软提示（warnings） |
| 服务端 XSS 清洗 | 零依赖白名单清洗（script / 事件属性剥离，data:image 保留） |
| 树形任务与批量事务 | 父子孙级联删除、批量创建事务回滚 |

---

> 提示：已完成的任务便利贴冻结（不能挂载 / 修改 / 取消确认，可删除）；任务完成前需确认其全部便利贴。方案已转任务且任务存在时状态冻结。
