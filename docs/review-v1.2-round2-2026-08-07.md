# v1.2.0 第二轮 Review 报告（2026-08-07 17:00）

> review 对象：common 在 dev slot 第一轮加载后的 10 项大调整 + review 反馈

## 结论

**改动整体质量高于常规水平**——assignees 全链路（create/update/list/get/calendar/tools）序列化反序列化覆盖完整、`json_each` + `json_valid` 兜底正确、RichEditor 6 个新扩展全部注册且正确拆到异步 chunk、第一轮 B 改动（删二级切换）清理彻底。

发现 **P1 级 2 项、P2 级 6 项、P3 级 9 项**，其中两项 P1 在本轮内处理，其余按优先级分批。

---

## P0（无）

未发现必现崩溃或数据损坏级问题。

第一轮反馈的「p=null 时 `p.files` 裸访问崩溃」已修复（views/Project/index.vue 全部改为 `p?.xxx`）。

---

## P1（必须修）

### P1-1 db.js migrateToV3 迁移顺序错误

- **位置**：`lib/db.js` → `migrateToV3()`，原 DROP COLUMN 在 L159-161，DROP INDEX 在 L172
- **问题**：当前顺序是「DROP COLUMN assignee → DROP INDEX idx_tasks_assignee」，但 v2 库的 `assignee` 列已被 `idx_tasks_assignee` 索引引用（v2 迁移在 `migrateV1ToV2` 中创建），SQLite 对被索引列执行 DROP COLUMN 会抛错。`createDataAccess` 在 `routes/ui.js` 路由注册时同步执行，**迁移失败 = 插件 UI 路由整体加载失败**。新库 / v1 库不受影响，但任何真实 v2 dev 库升级都会触发
- **风险**：升级路径上只要存在真实 v2 库，插件 UI 整体起不来
- **修法**：把 `DROP INDEX IF EXISTS idx_tasks_assignee` 提前到 DROP COLUMN 之前
- **状态**：✅ 已修

### P1-2 routes/ui.js open-file 命令注入（既有代码）

- **位置**：`routes/ui.js` → `/api/open-file` handler
- **问题**：`filePath` 只转义单引号后直接拼进 `exec("powershell.exe ... Start-Process '${filePath}'")`。路径含 `&` / `&` 等 cmd 元字符时命令解析错乱；构造恶意路径可注入执行任意命令
- **风险**：普通文件名含 `&`（Windows 合法字符）就打不开文件；安全漏洞
- **修法**：改用 `execFile` + 参数数组传参（不经 cmd shell），路径用 `-LiteralPath` 包裹
- **状态**：✅ 已修（验证：`'; rm -rf /; '` → `'''; rm -rf /; '''` 字面化；`&` 路径保留；execFile 参数数组实调）

---

## P2（建议修）

### P2-1 日历 tab 首屏行为（待实测）

- **位置**：`views/Project/index.vue` 日历 tab（L62-71）+ `CalendarWidget.vue`
- **问题**：日历 tab 与任务 tab 同用 `v-show` 挂载：默认进入 tasks tab 时，FullCalendar 在 `display:none` 容器里完成初始化（首屏就多发一次 `calendar-tasks` 请求、FC 在 0 高度容器渲染）。切到日历 tab 时 `dayMaxEvents=3` 的 +more/事件折叠计算可能基于错误尺寸
- **建议**：tab 切到 calendar 时 `nextTick` 后调 `getApi().updateSize()`；或日历 tab 改 `v-if` 延迟挂载
- **状态**：⏸️ 留鹏哥实测

### P2-2 ProjectFormModal 成员无候选池（已修）

- **位置**：`views/Home/components/ProjectFormModal.vue`（原 L52-64）
- **问题**：成员 `el-option` 数据源是 `form.members` 自身（**新建项目时下拉空白**）；`filterable + allow-create` 下输入部分前缀（如「张」）回车会误创建残缺成员名；提交时 members 未 trim/去重
- **修法**：候选池从全局聚合（汇总所有项目 members，弹窗打开拉取）；输入值 trim + 去重后再入数组
- **状态**：✅ 已修

### P2-3 后端 members 解析兜底缺失（已修）

- **位置**：`lib/data.js` getProjectFull（`JSON.parse(row.members)` 无兜底）+ createProject / updateProject（members 无数组校验）
- **问题**：members 与 assignees 防御不对称：`tasks.assignees` 有 `parseAssignees` 兜底，**projects.members 脏 JSON 会让 getProject 直接 500**；非数组值（工具层误传字符串）会原样入库，前端 `v-for` 逐字符渲染出单字符成员 pill
- **修法**：新增 `parseMembers`（JSON 解析兜底）+ `normalizeMembers`（数组校验 + trim + 去重），getProjectFull / listProjects / createProject / updateProject 全部接入
- **状态**：✅ 已修

### P2-4 已完成组 draggable 跨组（鹏哥未反馈）

- **位置**：`views/Project/components/TaskTab.vue` 已完成组 draggable（模板 L93-120）
- **问题**：未完成组 draggable 有 `group="tasks"`，**已完成组没有** → 两组跨容器拖拽行为不一致；跨组拖拽走 `handleCrossMove` 只移动不改变 `done`，刷新后任务回到原组（语义断裂）
- **建议**：统一 group 配置；明确「拖到已完成组」的交互语义（建议拖拽仅排序，完成/激活统一走勾选按钮）
- **状态**：⏸️ 留待确认

### P2-5 ProjectMeta 死代码清理（已修）

- **位置**：`views/Project/components/ProjectMeta.vue`（scoped L353-398 + 模板 L20）
- **问题**：E 改动残留：`.status-menu` / `.status-menu-item(.active)` / `@keyframes statusMenuIn` / `.chip-caret.open` 已无对应模板元素；`ref="statusDropdownRef"` 在 script 中未声明
- **修法**：删除手写下拉残留样式；移除未声明的模板 ref
- **状态**：✅ 已修

### P2-6 status 白名单（已修）

- **位置**：`lib/data.js` → `createProject` / `updateProject` allowed 白名单循环
- **问题**：`status` 无值域校验：前端和工具层都限三个合法值，但直连 REST 可写入任意字符串入库
- **修法**：写入前校验 `status ∈ ['待开始', '进行中', '已完成']`，非法抛 400
- **状态**：✅ 已修（createProject 与 updateProject 对齐）

---

## P3（看心情）

| # | 位置 | 问题 | 状态 |
|---|---|---|---|
| 1 | ProjectMeta countdown | `const today = dayjs().startOf("day")` 顶层只算一次，跨天停留过期 | ⏸️ |
| 2 | RichEditor 对齐组 | 左对齐按钮 `isActive({ textAlign: 'left' })` 永不亮 | ⏸️ |
| 3 | RichEditor 颜色组 | 色点平铺工具栏，窄容器换行后工具栏过高；索引只增不减 | ⏸️ |
| 4 | TaskTab 已完成 draggable | 缩进 2/4/8 空格混用 | ⏸️ |
| 5 | README.md + docs/upgrade | 仍描述 `assignee` 单值、schema v2、`idx_tasks_assignee`，与 v3 不符 | ⏸️ 文档同步 |
| 6 | CalendarWidget fcOptions | `height: props.compact ? "auto" : "auto"` 三元无意义 | ⏸️ |
| 7 | Project/index.vue tab 初始化 | `localStorage` 恢复的 tab 值无白名单校验，脏值时四个 v-show 全 false → 空白页 | ⏸️ |
| 8 | TaskTab 弹窗宽度 | `width="800px"` + 无 max-width 兜底，宿主面板 <800px 时溢出 | ⏸️ 实测 |
| 9 | lib/db.js migrateToV3 | v2 dev 库 DROP COLUMN 会丢弃 assignee 存量数据，注释应明示数据丢失范围 | ⏸️ |

---

## 复审维度逐项核对

| 维度 | 结论 |
|---|---|
| 日历 tab 路径拼接 | ✅ 正确：`api/projects/:id/calendar-tasks?status=`（calendar.js 已注册对应路由） |
| CalendarWidget 重复实例化 | ✅ 单实例（v-show）；index.vue 同时存在右侧 sticky 小日历 + tab 大日历两个**独立实例**是有意设计 |
| assignees 序列化/反序列化 | ✅ 全覆盖：create/update（validateAssignees + JSON.stringify）、list/get/calendar/tools（parseAssignees 兜底） |
| 文件下拉清理（D） | ✅ 无残留：TaskTab 仅剩 el-select multiple |
| ProjectMeta el-dropdown 误触 onEdit | ✅ 无风险：`@command` 只在菜单项点击触发，外层 click.stop 阻隔 |
| el-dropdown teleport 全局样式 | ✅ 无重名污染：`.status-dd-item` 独有 |
| RichEditor 扩展注册 | ✅ 6 个新扩展全部在 extensions 数组 + package.json 依赖中；异步 chunk 隔离 |
| listTasks 成员筛选 SQL | ✅ `json_each` 元素精确匹配 + `json_valid` 兜底 |
| v2→v3 迁移幂等 | ✅ 重复跑幂等；带索引的 v2 库首次迁移也能跑（P1-1 已修） |
| XSS | ✅ assignees 前端为文本插值；description 前后端双重 sanitize 白名单 |

---

## 测试覆盖

| 项 | 结果 |
|---|---|
| 复审专项（v2 带索引库迁移 / open-file 转义 + execFile / status 白名单 / members 契约 / 死代码静态断言） | **16/16** |
| assignees + members 快速回归（v1→v3 迁移、JSON 存取、日历） | 通过 |
| 前端 `npm run build` | 通过 |
| 后端语法检查（3 文件） | 全过 |