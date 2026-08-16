# 项目管理 · 功能速查

项目管理插件为 **Agent 与人工** 双端提供项目全生命周期管理：项目集分组、树形任务、批注（便利贴）、文件资产（多级文件夹）、方案管理、需求管理、分析总结、周报生成、会话关联、**消息中心**（到期/风险聚合提醒）与**全文检索**。人工端在「项目管理」页面操作，Agent 端通过 75 个工具读写数据，两侧数据实时互通。

---

## 通用功能

### 核心模块

| 模块 | 能力 |
| --- | --- |
| 项目集 | 分组管理、拖拽排序、右键菜单增删改；集下还有项目时禁止删除 |
| 项目 | 增删改查；成员、起止日期、状态流转（待开始 / 进行中 / 已完成 / 已取消）；归档与恢复；收藏置顶 |
| 树形任务 | 父子孙多级结构，删除父任务**级联删除**子孙；批量创建（≤50 条，中途失败整体回滚）；编辑支持改父任务；等级 P0~P5；里程碑旗帜标记；三种排序模式（默认可拖拽 / 时间 / 等级）；关键词搜索命中任务名 / 描述 / 批注内容 |
| 多级文件夹 | file_folders 无限层级树 + 文件归属；新建/重命名（同级重名校验）/ 拖拽换父级（防环）/ 删除真删除（递归删子孙夹+夹内文件登记，磁盘不碰）；拖拽防环禁用提示；左侧空白=根目录；框选（AABB 实时碰撞）+ Ctrl/Shift 多选 + Delete 批量删除；分割线可拖（双击复位）+ 文件夹/树宽持久化；hover 气泡（名称前 10 字）；桌面拖入文件登记；右键打开文件夹 |
| 文件资产 | 资产化登记：大小、类型、摘要（digest）；路径失效防御（文件被移动/删除不报错）；上传与桌面文件选取；文件内容提取（txt/docx/pdf） |
| 方案 | 标题 + 富文本内容；状态流转与业务校验（已转任务冻结）；评论；一键转任务；文件导入（txt/md/docx）；反向展示满足的需求；**双向关联任务**（任务只能关联**已采纳**方案，前后端一致拦截；删任务后方案可再次转任务） |
| 需求 | 三态流转（待处理→已完成/已取消，冻结）；优先级 P0~P5；需求↔方案多对多双向挂载；筛选/搜索/分页；**手动排序**（拖拽调整） |
| **消息中心** | 项目集条右上角铃铛 + 未读角标；FloatPanel 弹窗（header 搜索琥珀高亮 + 删除二次确认 + 全部已读 + 设置；左列表 20 条/页滚动加载；右详情）；**到期提醒**（提前 N 天可配置）与**风险提醒**（仅非归档+进行中/待开始项目的中高级风险）同类**每日聚合一条**（batch_key 幂等，不轰炸）；提醒配置（提前天数 1~14 / 到期开关 / 风险开关） |
| **全文检索** | FTS5 trigram 中文检索（零依赖）：任务/批注/方案/需求/备注/文件名/**项目名**统一搜，3 字以上全量检索、1~2 字 LIKE 模糊匹配；三入口（项目内放大镜 / 项目集条放大镜 / Ctrl+F）；结果按类型分组 + 卡片式字段展示（标题/内容/所属项目）+ 命中词琥珀高亮 + 点击跳转原文；增量索引（写操作打脏标记，仅重建脏项目）+ 首次全量建索引动效 |
| tab 栏 | 7 tab 数据驱动 + 拖拽调序 + 右键设置；项目级 > 全局级 > 默认顺序；**页面持久化**（tab 顺序/显隐、搜索词、排序、需求/方案状态筛选自动记忆） |
| 批注（便利贴） | 四类：`note` 备注 / `decision` 决策 / `risk` 风险 / `milestone` 节点；待确认 / 已确认两种状态；任务级与项目级筛选；批注管理大屏（可折叠任务树 + 全部任务视图 + 关键字搜索）；已完成任务冻结（不可挂载/修改，可删除） |
| 成员 | 全局成员表（name 唯一）；项目/任务人员下拉统一走成员体系，支持快捷新增与管理；历史人名自动聚合补录 |
| 里程碑步骤条 | 有里程碑的任务自动生成时间轴：项目起止端点 + 旗子节点 + 批注标签（前 10 字），popover 展示全部里程碑 |
| 审计追踪 | 所有写操作记录（创建/更新/删除含新旧值；覆盖排序/移动/会话关联/文件夹级联删文件/删消息）；行为 + 时间范围筛选；变更字段自动翻译成业务语言 |
| 日历 | 全项目 / 单项目任务日历弹窗：按任务起止日期聚合，点击任务跳转定位 |
| 备注 | 项目级备注，随项目详情查看与编辑（富文本） |
| 功能速查弹窗 | 右下角 `?` 按钮，运行时读取本文档渲染 |
| 安全与校验 | 服务端 XSS 清洗（零依赖白名单）；非法成员 / 非法日期拒绝，日期越界软提示（warnings） |

### 分析能力

| 能力 | 说明 |
| --- | --- |
| 概览面板 | 项目详情顶部折叠面板：KPI 四宫格（剩余/延期/待确认/缺日期）、风险清单（类别排序）、nextSteps 建议 |
| 自动总结 | 任务/批注/备注多维汇总，含进度、风险、待确认、延期、下一步建议；数据实时生成（auto / manual 两种来源） |
| 风险识别 | 6 条规则（任务延期、逼近截止、批注积压、项目逾期、任务缺日期、项目停滞），可**项目级配置**开关/阈值/等级；风险批注聚合为一条；风险条目按类别排序（项目→任务→批注） |
| 风险汇总 | `list_project_risks` 跨项目风险汇总（按项目集范围），**口径：仅非归档 + 进行中/待开始项目，仅中高级别风险（low 不入列不计数）**；概览视图直接展示 |
| 历史时间线 | 按时间倒序回看历史总结，可筛选类型、点击查看全文 |
| 项目问答 | `ask_project` 按 scope 输出总结 / 风险 / 决策 / 时间线 / 文件 / 需求 / 方案（all 合并） |
| 周报生成 | `generate_report` / 概览页「一键生成周报」：按本周/上周/近 7 天/自定义生成 Markdown（完成项/进行中/风险/下周建议）；完成项按 done_at 落在区间；风险/建议沿用 6 条规则 |
| 详情弹窗 | 需求/方案/任务详情右上「上一条/下一条」导航（编辑态不显示）；点击列表行预览，编辑/删除在弹窗内，编辑取消回落详情 |

### 会话关联

项目可与 Hana 会话双向关联：Agent 在处理某个项目时把会话挂到项目下，会话上下文随项目沉淀；支持关联、查询、解除，重复关联自动去重，sessionId 有格式与长度校验。

### Agent 工具（75 个）

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 项目集 | `create_project_set` `update_project_set` `delete_project_set` `list_project_sets` | 项目集增删改查 |
| 项目 | `create_project` `update_project` `delete_project` `list_projects` `get_project` | 项目增删改查；update 支持归档/收藏；get 支持 `view=summary` 轻量模式 |
| 任务 | `create_task` `create_tasks` `update_task` `update_tasks` `delete_task` `delete_tasks` `get_task` `list_tasks` | 树形任务增删改查；update_tasks 批量（≤50 条，逐条独立校验，单条失败不影响其他，返回成功/失败清单）；list 支持 `nearDeadlineDays` 临近截止筛选；get_task 全局查询支持短前缀 |
| 批注 | `create_annotation` `create_annotations` `update_annotation` `update_annotations` `delete_annotation` `delete_annotations` `list_annotations` `confirm_annotations` | 批注增删改查 + 批量确认（三范围）；update_annotations 批量（冻结条目标记失败） |
| 风险 | `get_project_risks` `list_project_risks` | 项目风险（读侧）与跨项目风险汇总 |
| 文件 | `list_project_files` `get_project_file` `register_project_file` `move_project_file` `delete_project_file` `create_project_folder` `update_project_folder` `delete_project_folder` `read_project_file` | 文件资产清单/详情/登记/移动/删除；多级文件夹管理（建/改/删，删除真删除=递归删子孙夹+文件登记，磁盘不碰）；文件内容提取（txt/docx/pdf）；register 支持 folderId 指定目录 |
| 成员 | `list_members` `create_member` `update_member` `delete_member` | 全局成员管理 |
| 会话 | `link_project_session` `list_project_sessions` `unlink_project_session` | 项目与会话双向关联 |
| 总结 | `summarize_project` `ask_project` `get_project_summaries` `generate_report` | 项目总结 / 问答 / 历史总结 / 一键周报 |
| 方案 | `create_plan` `update_plan` `delete_plan` `list_plans` `get_plan` `add_plan_comment` `delete_plan_comment` `convert_plan_to_task` `import_plan_file` | 方案全生命周期 + 文件导入 |
| 需求 | `create_requirement` `update_requirement` `update_requirement_status` `delete_requirement` `list_requirements` `get_requirement` `link_requirement_plans` `unlink_requirement_plans` | 需求增删改查 + 三态流转 + 方案双向挂载 |
| 备注 | `create_note` `update_note` `delete_note` | 项目备注管理 |
| 消息 | `list_messages` `mark_message_read` `delete_message` `get_message_unread_count` `get_message_config` `update_message_config` | 消息中心：列表分页 / 已读 / 删除 / 未读计数 / 提醒配置 |
| 搜索 | `search_all` | **全文检索**：FTS5（3 字以上）+ LIKE 兜底（1~2 字）；projectId 限定项目内搜索；type 过滤；返回分组结果 + snippet + fullIndexed |
| 审计 | `list_audit_logs` | 审计日志查询（行为/类型/关键词/时间筛选，分页） |

---

> 提示：已完成的任务便利贴冻结（不能挂载 / 修改 / 取消确认，可删除）；任务完成前置需其全部便利贴**已确认**且**子任务全部完成**；方案已转任务且任务存在时状态冻结（删任务后可再次转任务）；任务只能关联**已采纳**的方案；风险规则 6 条可项目级配置；消息提醒仅到期 + 风险两类（协同通知 V2.3 已移除），风险统计/提醒口径为非归档 + 进行中/待开始项目的中高级风险。
