# 项目管理 · 功能速查

项目管理插件为 **Agent 与人工** 双端提供项目全生命周期管理：项目集分组、树形任务、批注（便利贴）、文件资产（多级文件夹）、方案管理、需求管理、分析总结与会话关联。人工端在「项目管理」页面操作，Agent 端通过 65 个工具读写数据，两侧数据实时互通。

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
| 方案 | 标题 + 富文本内容；状态流转与业务校验（已转任务冻结）；评论；一键转任务；文件导入（txt/md/docx）；反向展示满足的需求 |
| 需求 | 三态流转（待处理→已完成/已取消，冻结）；优先级 P0~P5；需求↔方案多对多双向挂载；筛选/搜索/分页 |
| tab 栏 | 7 tab 数据驱动 + 拖拽调序 + 右键设置；项目级 > 全局级 > 默认顺序 |
| 批注（便利贴） | 四类：`note` 备注 / `decision` 决策 / `risk` 风险 / `milestone` 节点；待确认 / 已确认两种状态；任务级与项目级筛选；批注管理大屏（可折叠任务树 + 全部任务视图 + 关键字搜索）；已完成任务冻结（不可挂载/修改，可删除） |
| 成员 | 全局成员表（name 唯一）；项目/任务人员下拉统一走成员体系，支持快捷新增与管理；历史人名自动聚合补录 |
| 里程碑步骤条 | 有里程碑的任务自动生成时间轴：项目起止端点 + 旗子节点 + 批注标签（前 10 字），popover 展示全部里程碑 |
| 审计追踪 | 所有写操作记录（创建/更新/删除，含新旧值）；行为 + 时间范围筛选；变更字段自动翻译成业务语言 |
| 日历 | 全项目 / 单项目任务日历弹窗：按任务起止日期聚合，点击任务跳转定位 |
| 备注 | 项目级备注，随项目详情查看与编辑（富文本） |
| 功能速查弹窗 | 右下角 `?` 按钮，运行时读取本文档渲染 |
| 安全与校验 | 服务端 XSS 清洗（零依赖白名单）；非法成员 / 非法日期拒绝，日期越界软提示（warnings） |

### 分析能力

| 能力 | 说明 |
| --- | --- |
| 概览面板 | 项目详情顶部折叠面板：KPI 四宫格（剩余/延期/待确认/缺日期）、风险清单（类别排序）、nextSteps 建议 |
| 自动总结 | 任务/批注/备注多维汇总，含进度、风险、待确认、延期、下一步建议；数据实时生成（auto / manual 两种来源） |
| 风险识别 | 7 条规则（项目无起止日期、任务延期/临近截止/无日期/无负责人、批注无确认等），可**项目级配置**开关/阈值/等级；风险批注聚合为一条；风险条目按类别排序（项目→任务→批注） |
| 风险汇总 | `list_project_risks` 跨项目风险汇总（按项目集范围），概览视图直接展示 |
| 历史时间线 | 按时间倒序回看历史总结，可筛选类型、点击查看全文 |
| 项目问答 | `ask_project` 按 scope 输出总结 / 风险 / 决策 / 时间线 / 文件 |

### 会话关联

项目可与 Hana 会话双向关联：Agent 在处理某个项目时把会话挂到项目下，会话上下文随项目沉淀；支持关联、查询、解除，重复关联自动去重，sessionId 有格式与长度校验。

### Agent 工具（65 个）

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| 项目集 | `create_project_set` `update_project_set` `delete_project_set` `list_project_sets` | 项目集增删改查 |
| 项目 | `create_project` `update_project` `delete_project` `list_projects` `get_project` | 项目增删改查；update 支持归档/收藏；get 支持 `view=summary` 轻量模式 |
| 任务 | `create_task` `create_tasks` `update_task` `delete_task` `delete_tasks` `get_task` `list_tasks` | 树形任务增删改查；list 支持 `nearDeadlineDays` 临近截止筛选 |
| 批注 | `create_annotation` `create_annotations` `update_annotation` `delete_annotation` `delete_annotations` `list_annotations` `confirm_annotations` | 批注增删改查 + 批量确认（三范围） |
| 风险 | `get_project_risks` `list_project_risks` | 项目风险（读侧）与跨项目风险汇总 |
| 文件 | `list_project_files` `get_project_file` `register_project_file` `move_project_file` `delete_project_file` `create_project_folder` `update_project_folder` `delete_project_folder` `read_project_file` | 文件资产清单/详情/登记/移动/删除；多级文件夹管理（建/改/删，删除真删除=递归删子孙夹+文件登记，磁盘不碰）；文件内容提取（txt/docx/pdf）；register 支持 folderId 指定目录 |
| 成员 | `list_members` `create_member` `update_member` `delete_member` | 全局成员管理 |
| 会话 | `link_project_session` `list_project_sessions` `unlink_project_session` | 项目与会话双向关联 |
| 总结 | `summarize_project` `ask_project` `get_project_summaries` | 项目总结 / 问答 / 历史总结 |
| 方案 | `create_plan` `update_plan` `delete_plan` `list_plans` `get_plan` `add_plan_comment` `delete_plan_comment` `convert_plan_to_task` `import_plan_file` | 方案全生命周期 + 文件导入 |
| 需求 | `create_requirement` `update_requirement` `update_requirement_status` `delete_requirement` `list_requirements` `get_requirement` `link_requirement_plans` `unlink_requirement_plans` | 需求增删改查 + 三态流转 + 方案双向挂载 |
| 备注 | `create_note` `update_note` `delete_note` | 项目备注管理 |
| 审计 | `list_audit_logs` | 审计日志查询（行为/类型/关键词/时间筛选，分页） |

---

> 提示：已完成的任务便利贴冻结（不能挂载 / 修改 / 取消确认，可删除）；任务完成前需确认其全部便利贴。方案已转任务且任务存在时状态冻结。
