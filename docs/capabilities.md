# 项目管理 · 功能速查

项目管理插件为 **Agent 与人工** 双端提供项目全生命周期管理：项目集分组、树形任务、批注（便利贴）、文件资产（多级文件夹）、方案管理、需求管理、消息提醒、全文检索、分析总结、周报生成、临时任务与会话关联。人工端在「项目管理」页面操作，Agent 端通过 81 个工具读写数据，两侧数据实时互通。

---

## 通用功能

### 核心模块

| 模块 | 能力 |
| --- | --- |
| 项目集 | 分组管理、拖拽排序、右键菜单增删改；集下还有项目时禁止删除；集条右上角消息铃铛 + 未读角标 |
| 项目 | 增删改查；成员、起止日期、状态流转（待开始 / 进行中 / 已完成 / 已取消）；归档与恢复；收藏置顶；删除时回退转化自该项目的临时任务 |
| 树形任务 | 父子孙多级结构，删除父任务**级联删除**子孙，转化来源的临时任务自动回退为已完成并清除转化标记；批量创建（≤50 条，中途失败整体回滚）；编辑支持改父任务；等级 P0~P5；里程碑旗帜标记；三种排序模式（默认可拖拽 / 时间 / 等级）；关键词搜索命中任务名 / 描述 / 批注内容 |
| 多级文件夹 | file_folders 无限层级树 + 文件归属；新建/重命名（同级重名校验）/ 拖拽换父级（防环）/ 删除真删除（递归删子孙夹+夹内文件登记，磁盘不碰）；拖拽防环禁用提示；左侧空白=根目录；框选（AABB 实时碰撞）+ Ctrl/Shift 多选 + Delete 批量删除；分割线可拖（双击复位）+ 文件夹/树宽持久化；hover 气泡；桌面拖入文件登记；右键打开文件夹 |
| 文件资产 | 资产化登记：大小、类型、摘要（digest）；路径失效防御（文件被移动/删除不报错）；上传与桌面文件选取；文件内容提取（txt/docx/pdf） |
| 方案 | 标题 + 富文本内容；状态流转与业务校验（已转任务冻结）；评论（增删改 + 引用）；版本管理；一键转任务；方案对比；文件导入（txt/md/docx）；反向展示满足的需求 |
| 需求 | 三态流转（待处理→已完成/已取消，冻结）；优先级 P0~P5；需求↔方案多对多双向挂载；评论（增删改 + 引用）；版本管理；筛选/搜索/分页/排序 |
| 统一评论 | 需求/方案共用 comments 表；增删改全量审计（删除带内容快照）；划词引用评论：阅读模式选中文字 → 气泡【引用】→ 评论挂引用锚（Tiptap Mark 数据内锚），被引用文字高亮（虚线下划线 + 琥珀底），点高亮↔点评论双向定位，原文被删则退化为孤立评论（灰显）；输入框可拖拽放大（提交复位）；评论面板宽度可拖拽（260~480，双击复位，localStorage 记忆）+ 可折叠 |
| 版本管理 | 需求/方案共用：每次保存内容实际变化自动存版（创建存 v1，保留最近 50 版）；版本历史弹窗任选两版对比（逐字段 + 块级 LCS + 字符级高亮，自写不引依赖）；还原 = 旧内容存为新版本（版本链不断）；版本可标记重要备注 |
| 验证模块 | 项目「验证」tab：验证卡列表（小卡片：名称/备注/关联任务/进度条，每页 20 条）→ 点卡片开弹窗编辑验证项清单（分类分组 + 打勾落库）；新建/编辑走公共 FormDialog（名称 + 关联任务多选 + 备注）；进度 = 卡内验证项完成度，不做状态流转；增删改/勾选全量审计；名称与备注进全文检索 |
| tab 栏 | 7 tab 数据驱动 + 拖拽调序 + 右键设置；项目级 > 全局级 > 默认顺序；tab 顺序与显隐持久化 |
| 批注（便利贴） | 四类：`note` 备注 / `decision` 决策 / `risk` 风险 / `milestone` 节点；待确认 / 已确认两种状态；任务级与项目级筛选；批注管理大屏（可折叠任务树 + 全部任务视图 + 关键字搜索）；已完成任务冻结（不可挂载/修改，可删除） |
| 成员 | 全局成员表（name 唯一）；项目/任务人员下拉统一走成员体系，支持快捷新增与管理；历史人名自动聚合补录 |
| 里程碑步骤条 | 有里程碑的任务自动生成时间轴：项目起止端点 + 旗子节点 + 批注标签（前 10 字），popover 展示全部里程碑 |
| 审计追踪 | 所有写操作记录（创建/更新/删除，含新旧值）；行为 + 时间范围筛选；变更字段自动翻译成业务语言 |
| 日历 | 全项目 / 单项目任务日历弹窗：按任务起止日期聚合，点击任务跳转定位；全项目日历按当前选中项目集过滤，状态三档筛选（全部 = 待开始+进行中+已完成 / 未完成 = 待开始+进行中 / 已完成），始终排除已取消与已归档 |
| 备注 | 项目级备注，随项目详情查看与编辑（富文本） |
| 消息中心 | 项目集条铃铛 + 未读角标；弹窗左列表（20 条/页滚动加载）右详情；到期提醒（提前 N 天可配置）与风险提醒（仅非归档 + 进行中/待开始项目的中高级风险）；聚合消息（同类每日一条不轰炸）；搜索高亮 / 右键删除 / 一键已读 / 提醒配置 |
| 全文检索 | 三入口（项目内放大镜 / 项目集条放大镜 / Ctrl+F）；FTS5 中文检索（3 字以上 trigram，1~2 字模糊匹配）；结果按类型分组（项目/任务/批注/方案/需求/评论/验证项/临时任务/文件）卡片展示，命中词高亮，点击跳转原文；首次建索引有动效提示 |
| 一键周报 | 概览页「一键生成周报/阶段总结」：本周 / 上周 / 近 7 天 / 自定义范围生成 Markdown（完成项按 done_at 统计，含进行中/风险/下周建议） |
| 详情弹窗导航 | 需求/方案/任务详情右上导航（上一条/下一条），点击列表行预览，编辑/删除在弹窗内 |
| 公共表单弹窗 | 新建/编辑项目集、项目、任务、备注统一使用 FormDialog（基于 FloatPanel）：可拖拽移动、右下角缩放、双击标题栏撑满整页；自带表单校验与统一 footer；富文本编辑区随弹窗大小自适应，小窗长表单可滚动 |
| 项目卡片 | 传真单风格：白纸底、装订孔 + 撕口虚线、横格下划线、衬线字体 + 等宽编号；固定四行项目描述区，成员单行省略 |
| 临时任务 | 项目集 Tab 栏最前的独立页签（传真单风格）：点击条目原位编辑（光标落在点击处），回车保存并唤出末尾新增框，清空内容回车/outside 即删；↑↓ 逐视觉行移动光标、首末行跨任务（仿 Word）；快捷气泡点击常驻（完成/转正式/删除，已完成行为退回/转正式/归档/删除）；转正式任务（选项目插入）；归档（后端分页 + 搜索高亮 + 删除）；正式任务/项目删除时自动回退转化标记；四态流转 active → done → archived，converted 平行路径；全局搜索可命中（含归档） |
| 功能速查弹窗 | 右下角 `?` 按钮，运行时读取本文档渲染 |
| 安全与校验 | 服务端 XSS 清洗（零依赖白名单）；非法成员 / 非法日期拒绝，日期越界软提示（warnings） |

### 分析能力

| 能力 | 说明 |
| --- | --- |
| 概览面板 | 项目详情顶部折叠面板：KPI 四宫格（剩余/延期/待确认/缺日期）、风险清单（类别排序）、nextSteps 建议 |
| 自动总结 | 任务/批注/备注多维汇总，含进度、风险、待确认、延期、下一步建议；数据实时生成（auto / manual 两种来源） |
| 风险识别 | 6 条规则（项目无起止日期、任务延期/临近截止/无日期/无负责人等），可**项目级配置**开关/阈值/等级；风险批注聚合为一条；风险条目按类别排序（项目→任务→批注）；跨项目风险汇总仅统计非归档 + 进行中/待开始项目，仅中高级别 |
| 风险汇总 | `list_project_risks` 跨项目风险汇总（按项目集范围），概览视图直接展示 |
| 历史时间线 | 按时间倒序回看历史总结，可筛选类型、点击查看全文 |
| 项目问答 | `ask_project` 按 scope 输出总结 / 风险 / 决策 / 时间线 / 文件 / 需求 / 方案 |

### 会话关联

项目可与 Hana 会话双向关联：Agent 在处理某个项目时把会话挂到项目下，会话上下文随项目沉淀；支持关联、查询、解除，重复关联自动去重，sessionId 有格式与长度校验。

### 临时任务（典型话术）

- 「帮我记一条临时任务：明天上午给王总发合同终稿」→ `quick_task_add`
- 「看下我现在有哪些未完成的临时任务」→ `quick_task_list`（status=active）
- 「把「给王总发合同」那条标记完成 / 退回」→ `quick_task_update`（action）
- 「把那条临时任务转成瑞联SIP的正式任务」→ `quick_task_convert`（id + projectId）
- 「临时任务里搜一下域名」→ `quick_task_list`（keyword）或 `search_all`（type=quick-task）
- 「这个验证卡的验证项都过了吗」→ `list_verification_items`（projectId+verificationId）；总进度看 `list_verifications`
- 「把验证项 [xxxx] 标记通过」→ `toggle_verification_item`
- 「方案的上一版改了什么」→ `list_versions` 查版本列表，可视化 diff 在弹窗中查看；「还原到上一版」→ `restore_version`

### Agent 工具（91 个）

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 项目集 | `create_project_set` `update_project_set` `delete_project_set` `list_project_sets` | 项目集增删改查 |
| 项目 | `create_project` `update_project` `delete_project` `list_projects` `get_project` | 项目增删改查；update 支持归档/收藏；get 支持 `view=summary` 轻量模式；删除时回退来源临时任务 |
| 任务 | `create_task` `create_tasks` `update_task` `update_tasks` `delete_task` `delete_tasks` `get_task` `list_tasks` | 树形任务增删改查 + 批量更新（逐条独立校验，不整体回滚）；list 支持 `nearDeadlineDays` 临近截止筛选；删除时回退来源临时任务 |
| 批注 | `create_annotation` `create_annotations` `update_annotation` `update_annotations` `delete_annotation` `delete_annotations` `list_annotations` `confirm_annotations` | 批注增删改查 + 批量更新/确认（三范围）；已完成任务便利贴冻结 |
| 风险 | `get_project_risks` `list_project_risks` | 项目风险（读侧）与跨项目风险汇总 |
| 文件 | `list_project_files` `get_project_file` `register_project_file` `move_project_file` `delete_project_file` `create_project_folder` `update_project_folder` `delete_project_folder` `read_project_file` | 文件资产清单/详情/登记/移动/删除；多级文件夹管理（建/改/删，删除真删除，磁盘不碰）；文件内容提取；register 支持 folderId 指定目录 |
| 成员 | `list_members` `create_member` `update_member` `delete_member` | 全局成员管理 |
| 会话 | `link_project_session` `list_project_sessions` `unlink_project_session` | 项目与会话双向关联 |
| 总结 | `summarize_project` `ask_project` `get_project_summaries` `generate_report` | 项目总结 / 问答 / 历史总结 / 周报生成（本周/上周/近7天/自定义） |
| 方案 | `create_plan` `update_plan` `delete_plan` `list_plans` `get_plan` `add_plan_comment` `update_plan_comment` `delete_plan_comment` `convert_plan_to_task` `import_plan_file` | 方案全生命周期 + 评论（含编辑）+ 文件导入 |
| 需求 | `create_requirement` `update_requirement` `update_requirement_status` `delete_requirement` `list_requirements` `get_requirement` `link_requirement_plans` `unlink_requirement_plans` | 需求增删改查 + 三态流转 + 方案双向挂载 |
| 消息 | `list_messages` `mark_message_read` `delete_message` `get_message_unread_count` `get_message_config` `update_message_config` | 消息中心（到期/风险提醒聚合）；提醒配置（提前天数 1-14 + 开关） |
| 搜索 | `search_all` | 全类型全文检索：项目/任务/批注/方案/需求/评论/验证项/临时任务/文件名；FTS5 trigram + 高亮 snippet |
| 临时任务 | `quick_task_list` `quick_task_add` `quick_task_update` `quick_task_archive` `quick_task_delete` `quick_task_convert` | 随手记全生命周期：查询（状态/关键词筛选，归档态分页）/ 新增 / 编辑与完成退回 / 归档（单条/批量/全部）/ 删除（未完成/已完成/已转化均可直删 + 归档删除）/ 转正式任务（选项目插入） |
| 验证 | `list_verifications` `create_verification` `update_verification` `delete_verification` `list_verification_items` `add_verification_item` `update_verification_item` `toggle_verification_item` `delete_verification_item` | 验证卡（名称/关联任务/备注）全生命周期 + 卡内验证项清单（增删改查 / 勾选退回落库 + 审计），进度按验证项完成度计算 |
| 版本 | `list_versions` `restore_version` `set_version_label` | 需求/方案版本快照：查询 / 还原（旧内容存为新版本）/ 备注标记 |
| 备注 | `create_note` `update_note` `delete_note` | 项目备注管理 |
| 审计 | `list_audit_logs` | 审计日志查询（行为/类型/关键词/时间筛选，分页） |

---

> 提示：已完成的任务便利贴冻结（不能挂载 / 修改 / 取消确认，可删除）；任务完成前需确认其全部便利贴。方案已转任务且任务存在时状态冻结。
