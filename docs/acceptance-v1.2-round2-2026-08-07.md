# v1.2.0 第二轮验收清单（2026-08-07）

> 待鹏哥回来重启 Hana + reload dev slot 后实测

## 必测项（10 项功能调整）

| # | 测试点 | 期望 |
|---|---|---|
| 1 | 项目详情 → tab-bar | 4 个 tab：任务 / 日历 / 文件 / 备注 |
| 2 | 切到日历 tab | 显示 FullCalendar（task-mode + projectId 限定单项目），占满 tab-content |
| 3 | 日历 tab 右上角 | 「新建」按钮隐藏 |
| 4 | 任务弹窗宽度 | 800px 宽；body padding 24px；适配宿主面板 |
| 5 | 任务弹窗成员 | `el-select multiple`，可多选（勾选多人） |
| 6 | 任务弹窗关联文件 | `el-select multiple`，替换手写 tag + 下拉 |
| 7 | ProjectMeta 状态切换 | 状态 chip 点击 → `el-dropdown` 弹出 3 个 option（待开始 / 进行中 / 已完成） |
| 8 | 项目表单成员 | `el-select multiple` + 自由输入 + 候选池（聚合所有项目成员） |
| 9 | RichEditor 工具栏 | 10 组 30+ 按钮，分组竖线，激活高亮，tooltip |
| 10 | TaskTab 顶部 | 无「列表/日历」二级切换，只有列表视图 |

## 必测项（review 修复验证）

| # | 测试点 | 期望 |
|---|---|---|
| A | 进入项目详情 | 不抛 `Cannot read properties of null` |
| B | 编辑/新建任务 | 提交后 DB 里 `assignees` 是 JSON 数组；TaskCard 显示「张三、李四」 |
| C | 日历初始化 | 不崩，能看到任务日历事件（首屏行为可观察） |
| D | 项目成员表单 trim + 去重 | 输入「张三」+「张三」提交后只存一个 |
| E | ProjectMeta 死代码 | DevTools Elements 检查无 `.status-menu` 残留 className |
| F | 打开文件（含 `&` 字符文件名） | 能正常打开（既有 bug 修复） |

## 回归项（核心路径）

| # | 测试点 | 期望 |
|---|---|---|
| 1 | 新建项目 / 新建任务 / 编辑 / 删除 | CRUD 正常 |
| 2 | 拖拽任务排序（已/未完成组内）| 正常 |
| 3 | 跨项目移动任务 | 正常 |
| 4 | 文件上传 + 引用 | 正常 |
| 5 | 批注创建 / 编辑 / 确认 | 正常 |
| 6 | 富文本插图 + 缩略图 + preview | 正常 |
| 7 | 极端日期 `2026-02-30` 提交 | 后端拒绝（黄色 warn） |
| 8 | 老任务数据（无 assignees） | 正常显示，assignees 显示「未分配」 |

## 待修未修项（dev slot 验证后）

| 级别 | 位置 | 状态 |
|---|---|---|
| P2-1 | 日历 tab 首屏 FC 隐藏容器初始化 | 实测后决定 |
| P2-4 | 已完成组 draggable 跨组 | 等鹏哥反馈 |
| P3 全部 | 9 项 | 看心情 |