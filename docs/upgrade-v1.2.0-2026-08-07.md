# neo-project-manage V1.2.0 升级开发文档

> 需求提出：鹏哥 · 2026-08-07
> 当前版本：V1.1.1 → 目标版本：V1.2.0
> 工程红线：**只允许调整参数层，不容改动核心流程**

---

## 0. 现状速览

| 维度 | 现状 |
|---|---|
| 后端 | Node + better-sqlite3（vendor 嵌入），21 个 Agent 工具，REST 路由模块化 |
| 前端 | Vue 3 + Vite（独立构建 → `frontend/dist/`），App.vue / Home / ProjectDetail 三个视图 |
| 日历 | **已存在** `views/Project/components/CalendarWidget.vue`，基于 FullCalendar，事件源是「项目」（`planStart` / `planEnd`），已带「全部 / 未完成 / 已完成」筛选 |
| 弹窗 | 自定义 `.modal`（OKLCH 设计令牌），**无 Element Plus 依赖** |
| 富文本 | 无 |
| 数据存储 | SQLite WAL，`tasks` 表无 `assignee` / `start_date` / `end_date` 字段，`schema_version = 1` |
| 任务模型 | `id, project_id, parent_task_id, index_num, name, description, done, created_at` |

---

## 1. 需求清单（5 条）

| # | 需求 | 关键点 |
|---|---|---|
| 1 | 任务添加成员 | 成员池 = 项目 `members`，单选，非必填 |
| 2 | 任务添加起止时间 | YYYY-MM-DD，非必填，校验落在项目 `planStart` / `planEnd` 范围内 |
| 3 | 任务日历 tab | tab 内容是「有开始/结束日期的任务」日历，含「全部 / 未完成 / 已完成」筛选 |
| 4 | 引入 Element Plus 重构弹窗 | 任务、子任务、文件、备注、项目、项目集 6 类弹窗，统一 `el-form` + `rules` 校验 |
| 5 | 富文本 + 图片 | 任务描述 / 项目描述 / 备注支持富文本，可插入图片；大图自动缩略图，点击缩略图打开 preview 弹窗 |

---

## 2. ⚠️ 需要鹏哥拍板的 4 个关键决策

### 2.1 组件库版本
> 鹏哥原话是「elementui」，但项目是 Vue 3。

| 方案 | 说明 | 推荐 |
|---|---|---|
| **Element Plus** | Vue 3 官方对应，生态活跃 | ✅ |
| Element UI | Vue 2 时代，要降 Vue 2，重写量大 | ❌ 不推荐 |

### 2.2 富文本编辑器

| 方案 | 体积 | Vue 3 友好度 | 扩展性 | 推荐 |
|---|---|---|---|---|
| **Tiptap v2** | 较大（ProseMirror 内核，按需打包可瘦身） | 高（官方 `@tiptap/vue-3`） | 强（headless + 丰富 extension） | ✅ |
| wangEditor v5 | ~500KB gzip | 高 | 中（开箱即用但定制有限） | ❌ |
| Quill | 中 | 中（需额外包装） | 中 | ❌ |

### 2.3 图片存储方案

| 方案 | 实现 | 推荐 |
|---|---|---|
| **B. 上传到插件 file 目录，存 URL** | 新建 `POST /api/projects/:id/upload`，返回 URL；富文本里只存 URL | ✅ |
| A. base64 存数据库 | 简单但 DB 膨胀 | ❌ |
| C. 用 Hana 平台 file API | 待确认是否存在 | 待评估 |

### 2.4 任务日历的事件源
当前 CalendarWidget 事件源是「项目」，本次升级路径：

- 保留日历 tab 与「全部 / 未完成 / 已完成」筛选 UI 不变
- 事件源切换为「任务」（用新加的 `start_date` / `end_date`）
- 点击事件进入项目详情并滚动到该任务

---

## 3. 数据模型变更

### 3.1 `tasks` 表新增 3 列

| 字段 | 类型 | 约束 | 默认 | 说明 |
|---|---|---|---|---|
| `assignee` | TEXT | 必须在所属项目 `members` 中（软校验） | NULL | 任务成员，单值 |
| `start_date` | TEXT | YYYY-MM-DD | NULL | 任务开始日期 |
| `end_date` | TEXT | YYYY-MM-DD；>= start_date；落在项目 [planStart, planEnd] | NULL | 任务结束日期 |

### 3.2 索引新增

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_date, end_date);
```

### 3.3 Schema 迁移

- `lib/db.js` 中 `SCHEMA_VERSION: 1 → 2`
- 新增 `migrateV1ToV2()`：用 `ALTER TABLE` 添加列，幂等（先 `PRAGMA table_info(tasks)` 判断）
- 写入 `schema_meta`

---

## 4. 接口变更

### 4.1 工具参数扩展

| 工具 | 新增参数 |
|---|---|
| `create_task` | `assignee`, `startDate`, `endDate` |
| `create_tasks` | 同上（每条 item 独立） |
| `update_task` | `assignee`, `startDate`, `endDate` |
| `list_tasks` | `dateRange: 'withDates'`（用于日历拉取） |

校验逻辑集中在 `lib/data.js` 的 `createTask` / `updateTask`：

- `endDate >= startDate`，否则抛错
- 项目 `planStart` / `planEnd` 不为空时，软提示任务日期越界（不强制阻断，留给 UI 提示）

### 4.2 新增路由

```
GET /api/projects/:projectId/calendar-tasks
  ?status=done|undone|all        默认 undone
  → [{ id, name, startDate, endDate, projectId, done, parentTaskId, assignee }]
```

实现：在 `routes/modules/` 下新增 `calendar.js`，复用 `data.listTasks` + 内存过滤。

### 4.3 新增文件上传路由

```
POST /api/projects/:projectId/upload   (multipart/form-data, field=file)
  → { url: '/files/xxx.png' }
GET  /files/:name                      静态文件服务
```

> 仅在「图片存储方案选 B」时需要。

---

## 5. 前端变更

### 5.1 依赖新增

```json
{
  "element-plus": "^2.x",
  "@element-plus/icons-vue": "^2.x",
  "@tiptap/vue-3": "^2.x",
  "@tiptap/pm": "^2.x",
  "@tiptap/starter-kit": "^2.x",
  "@tiptap/extension-image": "^2.x",
  "@tiptap/extension-link": "^2.x",
  "@tiptap/extension-placeholder": "^2.x"
}
```

### 5.2 入口

- `main.js`：`app.use(ElementPlus)`，按需引入图标
- `App.vue`：移除 `.modal` / `.btn-primary` / `.btn-danger` 样式，保留 OKLCH 设计令牌作为全局变量
- 主题：覆盖 Element Plus 主题变量，对齐 OKLCH 色系

### 5.3 弹窗重构清单

| 弹窗 | 现有位置 | 重构为 |
|---|---|---|
| 新建/编辑任务 | `views/Project/components/Task*.vue` | `el-dialog` + `el-form` + 富文本 |
| 新建/编辑子任务 | 同上 | 同上 |
| 上传文件 | `views/Project/components/File*.vue` | `el-dialog` + `el-upload` |
| 新建/编辑备注 | `views/Project/components/Note*.vue` | `el-dialog` + `el-form` + 富文本 |
| 新建/编辑项目 | `views/Home/components/Project*.vue` | `el-dialog` + `el-form` + 富文本 |
| 新建/编辑项目集 | `views/Home/components/Set*.vue` | `el-dialog` + `el-form` |

### 5.4 表单校验规则

| 字段 | 规则 |
|---|---|
| 任务名 | 必填，1-50 字符 |
| 任务描述 | 可选，富文本 |
| 任务成员 | 可选，必须在项目 `members` 中 |
| 任务 startDate | 可选 |
| 任务 endDate | 可选，>= startDate |
| 项目名 | 必填，1-20 字符 |
| 项目描述 | 可选，富文本（取消 200 字符限制） |
| 项目集名 | 必填，1-10 字符 |
| 备注 | 必填，富文本 |

### 5.5 富文本组件

新增 `components/RichEditor.vue`：

- 基于 Tiptap v2 + `@tiptap/vue-3` 的 `useEditor` composable
- 引入扩展：StarterKit（粗体/斜体/标题/列表）、Image、Link、Placeholder
- 工具栏：粗体、斜体、标题、列表、链接、图片
- 图片上传：调 `POST /api/projects/:id/upload`，插入返回的 URL
- 限制：单图 ≤ 2MB，超出提示
- 输出：HTML 字符串（与 `description` / `content` 字段类型兼容）

### 5.6 图片预览

使用 `el-image` 内置 preview 能力：

```vue
<el-image :src="url" :preview-src-list="[url]" fit="cover" style="max-width: 200px; max-height: 200px;" />
```

富文本展示时，大图自动 `max-width: 100%`，点击触发 preview。

### 5.7 任务日历改造

`CalendarWidget.vue`：

- `events` 计算改用 `/api/projects/:id/calendar-tasks` 聚合数据（前端一次性拉所有项目的有日期任务）
- 事件颜色用 palette（已有）
- 事件点击：emit `select-project` 带任务 ID → 父页面跳转 + 滚动定位

---

## 6. 排期

| Phase | 内容 | 估时 | 依赖 |
|---|---|---|---|
| 1 | DB 迁移 + 工具参数扩展 + 任务表单 | 1-2 天 | — |
| 2 | Element Plus 引入 + 6 类弹窗重构 | 2-3 天 | Phase 1 |
| 3 | 富文本 + 图片上传 + preview | 2-3 天 | Phase 2 |
| 4 | 任务日历 tab 改造 | 1-2 天 | Phase 1 |
| 5 | 集成测试 + 兼容老数据 + 文档 | 1 天 | 全部 |

单人总估时：**7-11 天**

---

## 7. 风险与回滚

| 风险 | 缓解 |
|---|---|
| Element Plus 与 OKLCH 设计令牌冲突 | 覆盖 Element Plus 主题 SCSS 变量，对齐色板 |
| Tiptap 体积较大（ProseMirror 内核） | 动态 import 富文本组件 + 按需引入扩展，初始包不打包 |
| 图片上传需 Hana 插件 file API 配合 | 复用现有 `lib/data.js` 的 `addFile` + 新增静态目录 |
| 老数据无新字段 | 所有新字段 NULL 兼容，UI 显示「未设置」 |
| schema 迁移失败 | `migrateV1ToV2` 幂等，启动失败回滚不破坏数据 |

回滚：

- DB：新增列可保留，不影响旧查询
- 代码：`git revert` 即可（建议 `main` 上建 `feature/v1.2.0` 分支）

---

## 8. 测试策略

| 层级 | 范围 |
|---|---|
| 单元 | `lib/data.js` 中 createTask / updateTask / listTasks 的新参数路径 |
| 接口 | 每个工具的 happy + 边界（空 assignee、start > end、日期越界、跨项目写） |
| 前端 | 每个弹窗的提交/取消、表单校验、错误提示、富文本插图、日历筛选 |
| E2E | 建项目 → 选成员 → 建任务（带日期+富文本+图片）→ 日历查看 → 筛选 → 编辑 |

---

## 9. 待鹏哥拍板的清单

1. ✅ / ❌  **Element Plus**（强烈推荐 ✅）
2. ✅ / ❌  **Tiptap v2**（强烈推荐 ✅）
3. ✅ / ❌  **图片存插件目录 + URL**（强烈推荐 ✅）
4. **派谁开发？** pm / common / les / 其他？
5. **是否分批验收？** 每 Phase 完成后让鹏哥过一遍再推下一 Phase
6. **是否建 dev 分支？** `feature/v1.2.0`，避免污染 `main`

---

## 10. 鹏哥拍板结果（2026-08-07）

| # | 项 | 决定 |
|---|---|---|
| 1 | 组件库 | Element Plus ✅ |
| 2 | 富文本 | **Tiptap v2**（更新本文档，取代原 wangEditor 方案） |
| 3 | 图片存储 | 插件目录 + URL ✅ |
| 4 | 开发 agent | **common** |
| 5 | 分批验收 | 是（每 Phase 完验收） |
| 6 | dev 分支 | `feature/v1.2.0` |

---

## 11. 完成状态（2026-08-07）

| Phase | 内容 | 状态 | 验收 |
|---|---|---|---|
| 1 | DB 迁移 + 工具参数 + 任务表单 | ✅ 完成 | ✅ 通过 |
| 2 | Element Plus + 6 类弹窗重构 | ✅ 完成 | 待 review |
| 3 | Tiptap 富文本 + 图片上传 + preview | ✅ 完成 | 待 review |
| 4 | 任务日历 tab 改造 | ✅ 完成 | 待 review |
| 5 | 集成测试 + 兼容老数据 + 文档 | ✅ 完成 | 待 review |

### 11.1 测试结果

- Phase 1 单元测试：27/27 通过（迁移幂等、老数据保留、createTask/updateTask 三边界）
- Phase 3 上传接口测试：15/15 通过（合法上传 / 超 2MB / 非法扩展名 / 空文件 / 静态服务 / 路径穿越）
- Phase 5 集成测试：25/25 通过（建项目→任务→日历筛选→编辑→老数据→边界→工具）
- 前端构建：vite build 通过（RichEditor 拆独立 chunk，主包 476KB gzip）

### 11.2 实际偏差记录（相对本文档）

1. **SCHEMA_SQL 索引位置**：新索引（idx_tasks_assignee / idx_tasks_dates）不放 SCHEMA_SQL（老库启动会因缺列报错），统一在 `migrateV1ToV2` 中创建，新老库都走迁移（幂等）
2. **taskRowToObject 与 buildTaskTree 双路径输出**：工具路径（taskRowToObject）与 REST 路径（buildTaskTree）都输出 camelCase 的 `assignee / startDate / endDate`，供前端直接使用（集成测试发现的兼容 bug，已修复）
3. **FileTab 上传弹窗**：文件 tab 的「上传」本质是桌面本地路径引用（双击打开），未改用 el-upload（浏览器文件上传拿不到本地路径，会破坏桌面集成）；改用 el-dialog + 选择按钮 + 已选列表确认。el-upload 仅用于 Phase 3 富文本图片上传（真上传场景）
4. **新建项目时的富文本插图**：RichEditor 依赖 projectId 上传图片；新建项目弹窗无 projectId，图片按钮提示「缺少项目上下文」，插图能力在编辑项目时可用（建项目后再补图）
5. **assignee 校验强度**：非空且不在 members → 抛错（硬校验），鹏哥确认保留
6. **任务日期越界**：软提示不阻断，鹏哥确认保留
7. **manifest 版本号**：Phase 1 即升到 1.2.0，鹏哥确认保留
8. **CalendarWidget 双模式**：任务日历 tab（App.vue 日历页）用任务事件源 + `select-task`；项目详情内小日历保持项目事件源不动（`taskMode` prop 区分）

## 12. Review 批次 1 修复记录（2026-08-07）

| 条目 | 修复内容 |
|---|---|
| P0-1 存储型 XSS | 新增 `lib/sanitize.js`（零依赖白名单清洗：白名单标签+属性+协议，Token 级重建）；服务端 7 个写入入口统一清洗（create/update：task/project/note/annotation）；前端 `utils/sanitize.js`（DOMParser 版）在 `formatDescription` 内兜底清洗，覆盖 4 个 v-html 渲染点 |
| P0-2 构建产物加载冲突 | `loadAssets` 改为显式匹配 `^index-.*\.(js|css)$`；新增 `/assets/*` 静态路由（防穿越 + mime + DEBUG no-cache）；`buildHtml` 改为 `./assets/index-*.js` 外部引用（不内联，动态 import 的 chunk 可加载） |
| P1-1 updateTask parentTaskId | 补三重校验：自指 / 同项目归属（不存在或跨项目）/ 成环（复用 wouldCreateCycle） |
| P1-2 上传 DoS + 魔数 | Content-Length 前置拦截（超 2MB+1KB 直接 413，不读 body）；saveUploadedFile 补文件头魔数校验（png/jpeg/gif/webp）；上传与静态响应加 `X-Content-Type-Options: nosniff` |
| P1-3 富文本含图静默清空 | `richTextEmpty`（后端）/ `normalizeRichText`（前端 DOM 版）改为「无文本且无资源标签（img/a/video 等）」才判空，只含图片的备注可保存 |
| P1-4 项目集必选坑 | 去掉 `projectSetId` required；select 顶部加「未归类」选项（value=""）；后端落库 NULL 语义不变 |
| P1-5 createTask name 校验 | 新增 `validateTaskName`（trim 非空 + ≤50）；createTask/updateTask 均接入，前后端对齐 |

> 说明：原计划引入 sanitize-html/DOMPurify，但 `npm install` 会触发 node_modules 内 better-sqlite3 原生 rebuild（缺 VS 工具链）失败，且 jsdom 依赖重；改为自研零依赖白名单 sanitizer，13 组 XSS 向量测试全过（script/svg/iframe/事件属性/javascript:/data: 协议等）。

## 13. Review 批次 2 修复记录（2026-08-07）

| 条目 | 修复内容 |
|---|---|
| P2-1 非法日期 | `normalizeDate` 改 Date.UTC 构造 + 反向比对，拦截 2026-02-30 / 13 月 / 4 月 31 日等溢出日期（闰年正常放行） |
| P2-2 项目日期校验 | createProject / updateProject 补 planEnd >= planStart 硬校验（部分更新用合并值判断） |
| P2-3 批量事务 | 新增 `data.createTasks()`（db.transaction 包裹，任一条失败整体回滚）；tools/create-tasks.js 改用，删除自建循环 |
| P2-4 死代码 | 删除未被引用的 TaskFormModal.vue（grep 确认无 import） |
| P2-6 字段单轨 | buildTaskTree 排除 snake 新字段（assignee/start_date/end_date），输出统一 camelCase；前端确认无 snake 引用残留 |
| P2-8 越界组合 | validateTaskDates 补全四象限：新增 startDate>planEnd / endDate<planStart 两种提示 |
| P2-9 插图禁用 | RichEditor 无 projectId 时图片按钮禁用 + title「创建后可补图」（不再点击才报错） |
| P3-3 日期运算 | CalendarWidget 项目/任务事件 end 计算改用 dayjs 纯日期 +1 天，消除 UTC 时区偏差 |
| P3-4 README | 工具数 21→22（补 get_task），get 分类改 2 个 |
| P3-5 测试路由 | 移除 ui.js `__diag_*` / `debug-project` 与 tasks.js `__tasks_test__` 残留 |
| P3-7 异步组件 | 新增 utils/asyncEditor.js：loading/error 占位 + 15s 超时 + 自动重试 2 次，替换 3 处 defineAsyncComponent |
| P3-9 静态缓存 | uploads 静态响应缓存 max-age=1年 → no-cache（文件删除后立即可见，nosniff 保留） |

> 批次 2 测试：26/26（P2 全量 + P3-5/9）+ 回归 9/9（批次 1 关键点 + 迁移 + 核心路径）；前端构建通过；后端语法检查通过。

## 14. Review 复审微调记录（批次 3，2026-08-07）

| 条目 | 修复内容 |
|---|---|
| P0-1 日历崩溃 | CalendarWidget 两处事件 end 计算去掉多余 `.toISOString()`（dayjs 已返回字符串），任务/项目分支均修复；运行时验证用真实 dayjs 执行组件同款表达式 + 静态断言无残留 |
| P2 移动父级重排 | updateTask parentTaskId 分支改为事务内：更新父级 + 旧父级兄弟压缩（序号连续无空洞）+ 新父级追加末尾（复用 moveTask 重排思路） |
| P3-1 项目日期格式 | createProject/updateProject 的 planStart/planEnd 复用 normalizeDate（格式 + 反向比对，拦截 2026-13-01 / 2026-02-30 等） |
| P3-2 批量错误序号 | createTasks 事务内每条 createTask 包 try/catch，失败信息带「第 N 个任务：」前缀 |
| P3-3 前端 warnings 消费 | TaskTab 提交本地四象限越界提示与后端对齐，且成功响应透传展示 `res.data.warnings`（后端 P2-8 全量提示前端可见） |
| P3-4 README | update_task 工具描述去掉未暴露的「移动父级、替换文件引用」；/files/:name 缓存描述改「短缓存实时可见」 |
| P3-5 DEBUG 环境化 | `DEBUG = NODE_ENV==='development' || NEO_PM_DEBUG==='true'`，默认生产关闭（静态资源走 hash 不可变缓存）；调试设 `NEO_PM_DEBUG=true` |

> 批次 3 测试：18/18（P0-1 链路 + P2 重排 + P3 各 case）+ 综合回归 25/25（迁移/XSS/校验/批量/上传/日历/级联）；前端构建通过；后端语法检查通过。

## 15. 终局修复（2026-08-07，发版前）

| 条目 | 修复内容 |
|---|---|
| P2 日历筛选必现缺陷 | CalendarWidget：`watch(() => props.calFilter)` 误监听 props 上不存在的字段（永不触发）→ 改 `watch(calFilter)` 监听 ref 本身；`loadTaskEvents()` 拼接 `?status=${calFilter.value}`（此前不传参，后端默认只返回 undone，「已完成」tab 永远空白） |
| P3 upload.js 注释 | 头部 JSDoc「长缓存」改为「mime + no-cache，删除后立即可见」，与实现及 README 三处一致 |

> 终局验证：5/5 静态断言（watch 指向 ref / 无 props.calFilter 残留 / loadTaskEvents 带 status / JSDoc 无长缓存 / 实现 no-cache）+ 后端语法检查 + 前端构建通过。

## 16. P0-2 真问题修复（2026-08-07，dev slot 实测 403 后）

**现象**：dev slot install 后浏览器 403（`/api/plugins/neo-project-manage/assets/index-*.js`）——Hana 平台对插件 Hono app 的 `/assets/*` 静态路由挂载策略与 `app.use` 不匹配，且 v1.1.1 时代本就无静态路由（JS/CSS 全内联）。

**修复**（彻底回退内联模式 + 取消拆 chunk）：

| 文件 | 改动 |
|---|---|
| frontend/vite.config.js | `build.rollupOptions.output.inlineDynamicImports: true`——全部代码打包进单个 index-*.js，不再有 RichEditor-* chunk |
| routes/ui.js | 恢复 `loadAssets()`（readFileSync 进 cachedJs/cachedCss）；buildHtml 改回 `<style>${cachedCss}</style>` + `<script type="module">${cachedJs}</script>` 内联（v1.1.1 时代缺 type 因旧产物为 IIFE，现 Vite 输出 ESM 必须 type=module）；删除 `/assets/*` 静态路由 |

**保留**：显式 `^index-.*\.js$` 匹配（防御性）；P3-5 的 debug 路由清理与 DEBUG 环境化（独立改动不受影响）。

**验证**：dist/assets 仅 `index-4b1859fb.js`（1.8MB/gzip 583KB，EP+Tiptap 全内联）+ `index-fc0608ae.css`；buildHtml 内联输出断言 8/8（无外部引用 / 内联 style+script type=module / node --check ESM 合法 / 无顶层外部 import / 无 /assets 路由）。

> 体积代价：主包 gzip 583KB（原拆 chunk 时 478KB + 105KB 独立），单文件更便于内联注入，稳定优先。

## 17. 鹏哥实测 6 项修复（2026-08-07）

| 项 | 修复内容 |
|---|---|
| P0-1 大日历崩溃 | CalendarWidget 全面防御：`taskEvents.value` 数组检查（`|| []` / `Array.isArray`）、fcEvents computed try/catch 返回空事件、组件 `onErrorCaptured` 记录子组件（FullCalendar）错误堆栈、loadTaskEvents 失败 console.error、FC height 显式 "auto"；崩溃不再白屏，控制台可见根因 |
| P0-2 任务日历 tab | TaskTab 顶部新增「列表 / 日历」切换（默认列表）；日历视图复用 CalendarWidget（task-mode + projectId 限定单项目）；点击任务切回列表并滚动定位（scrollToTaskById） |
| P1 起止日期 range | 编辑弹窗两个独立 date-picker 改为单个 `type="daterange"`（value-format YYYY-MM-DD，range-separator 至）；watch 同步 form.startDate/endDate，后端契约不变 |
| P2 编辑器样式 | RichEditor 去暖黄色调：工具栏背景改 `var(--el-fill-color-lighter)`、边框改 `var(--el-border-color)` 系、文字改 `--el-text-color-*`；编辑区 min-height 80→200px（ProseMirror 180px）、max-height 320→400px，白底，溢出滚动 |
| P3 日期选择器英文 | main.js：`app.use(ElementPlus, { locale: zhCn })`（element-plus/es/locale/lang/zh-cn）+ `dayjs.locale("zh-cn")` + 引入 zh-cn locale 包 |

> 验证：前端构建通过（单文件 index-*.js 1.8MB/gzip 586KB）；10/10 静态断言（防御/切换/daterange/EP 变量/中文化）；后端语法未触碰。

## 18. P0 崩溃第二轮（2026-08-07）

**根因**：`views/Project/index.vue` 中 `p = ref(null)`（项目数据未加载），template 直接访问 `p.files` / `p.notes` → `TypeError: Cannot read properties of null`，进项目详情即崩。

**修复**（仅此一文件，未动其他组件）：

| 位置 | 改动 |
|---|---|
| TaskTab `:files` | `p.files` → `p?.files` |
| FileTab `:files` | `p.files` → `p?.files` |
| NoteTab `:notes` | `p.notes` → `p?.notes` |
| CalendarWidget `:projects` | `[p]` → `p ? [p] : []`（null 时传空数组） |

`p` 保持 `ref(null)` 初始值（单一加载状态语义不变）；computed/watch 已用 `p.value?.xxx` 处确认安全（incompleteCount / fullBreadcrumb / filteredTasks / loadProject 均有 ?. 或前置 null 判断）。

> 验证：grep `\bp\.(files|notes|members|tasks|planStart|planEnd|description|name|id)\b`（排除 `p?.` / `p.value`）→ **0 处**；前端构建通过；后端未触碰。

## 19. 鹏哥拍板第二轮调整（2026-08-07）

**拍板**：assignees 多选（复数，string[]，不考虑历史数据）+ 日历独立 tab + 弹窗重构 + 富文本加强。

| 项 | 内容 |
|---|---|
| A. 日历独立 tab | Project/index.vue tab-bar 改 4 个 tab（任务/日历/文件/备注）；日历 tab 内容 = CalendarWidget（task-mode + projectId 限定单项目，占满 tab-content）；新建按钮在日历 tab 隐藏；点击任务切回任务 tab 滚动定位 |
| B. 移除二级切换 | TaskTab 顶部「列表/日历」胶囊删除，恢复纯列表视图（onCalendarSelectTask/taskView 及 CalendarWidget import 清理） |
| C. 成员多选 | TaskTab 弹窗 `form.assignee` → `form.assignees`（string[]）+ el-select multiple（collapse-tags）；TaskCard 显示 `assignees.join('、')` |
| D. 关联文件多选 | 手写 file-refs-area（tag+按钮+下拉）→ el-select multiple（options 来自 props.files）；删除 fileMap/availableFiles/下拉状态与监听 |
| E. 状态切换 EP | ProjectMeta 手写 button+菜单 → el-dropdown（trigger=状态 chip，3 个 el-dropdown-item，选中 emit change-status）；teleport 样式用全局 style 块 |
| G. 项目成员多选 | ProjectFormModal 手写 input+chips → el-select multiple（filterable allow-create default-first-option，自由输入）；`form.members` 数组直传 |
| H. 弹窗尺寸 | TaskTab 任务弹窗 560→800px，body padding 24px（.task-dialog-el） |
| I. 后端 assignees | schema v1→v3 / v2→v3 幂等迁移（DROP 旧 assignee 列 + ADD assignees TEXT，dev 未发布直接改）；写入 JSON.stringify、读取 parseAssignees 兜底 []；validateAssignees 数组强校验；listTasks 按成员筛选改 json_each(t.assignees)（json_valid 兜底防脏数据崩溃）；listCalendarTasks 输出数组 |
| J. 富文本加强 | RichEditor 扩展：Underline/TextAlign/Color/Highlight/TaskList+TaskItem（新装 6 个 @tiptap 扩展，frontend 目录无 better-sqlite3 不触发 rebuild）；工具栏 10 组 30+ 按钮（撤销重做/文本/标题/列表/引用/代码/对齐/颜色高亮/链接图片/水平线清除格式），el-tooltip 包裹、分组竖线、激活高亮 |

**测试**：assignees 全链路 21/21（v1→v3 / v2→v3 迁移、数组校验与 JSON 存取、脏数据兜底、筛选、日历、工具）+ 核心路径回归 14/14（XSS/校验/重排/批量/上传/级联）；前端构建通过（index-*.js 1.8MB/gzip 588KB）；后端语法检查通过。

> 发现并修复的真 bug：listTasks 按成员筛选用 `json_each(t.assignees)`，库中脏数据（非 JSON）会导致 `malformed JSON` 崩溃 → 改用 `json_each(CASE WHEN json_valid(t.assignees) THEN t.assignees ELSE '[]' END)` 兜底。

## 20. Review 复审修复（2026-08-07）

| 条目 | 修复内容 |
|---|---|
| P1-1 迁移顺序 | migrateToV3：`DROP INDEX idx_tasks_assignee` 提前到 `DROP COLUMN assignee` 之前（SQLite 不允许 DROP 被索引依赖的列，v2 dev 库此前会抛错） |
| P1-2 open-file 注入 | ui.js 改用 `execFile("powershell.exe", ["-NoProfile","-Command", psCmd])`（不经 cmd shell）+ `Start-Process -LiteralPath` + 单引号 `''` 转义；路径中 `&` 等字符为字面量，恶意 `'; rm -rf /; '` 无法闭合字符串 |
| P2-5 死代码 | ProjectMeta 删除 `.status-menu` 系列 / `@keyframes statusMenuIn` / `.chip-caret.open` scoped 样式 + template `ref="statusDropdownRef"` |
| P2-6 status 白名单 | createProject / updateProject 写入前校验 `status ∈ [待开始/进行中/已完成]`，非法抛错（不污染 DB） |
| P2-2/3 成员契约 | 后端：`parseMembers`（JSON 解析兑底，对齐 parseAssignees）+ `normalizeMembers`（数组校验 + trim + 去重），getProjectFull / listProjects / create / update 全部接入；前端：ProjectFormModal 候选池从全局聚合（api/projects 汇总所有项目 members，弹窗打开时拉取）+ 当前已选合并去重，提交 trim + 去重 |

> 测试：复审专项 16/16（v2 带索引库迁移 / open-file 转义与 execFile / status 白名单 / members 契约 / 死代码静态断言）+ assignees/members 快速回归通过 + 前端构建 + 后端语法检查通过。

## 21. 第三轮修复（2026-08-07，dev slot 实测反馈）

| 问题 | 修复 |
|---|---|
| 1. 日历 tab 渲染 0 高度 | CalendarWidget `height: props.compact ? "auto" : 600`（non-compact 固定 600px）；`views/Project/index.vue` `.task-calendar-tab` min-height 480→600px（双保险） |
| 2. RichEditor 不能贴图 | 新增 `editorProps.handlePaste`：检测 clipboardData.items 中 `kind==='file'` 且 `type.startsWith('image/')` 的图片项 → preventDefault → 复用抽出的 `uploadAndInsert(file)`（校验/2MB/格式/上传/插入）→ 返回 true；无图片返回 false 走默认粘贴 |
| 3. 右侧小日历高度 | `views/Project/index.vue` `.detail-right` min-height 380→580px |
| 4. 右侧小日历内容语义 | **确认是项目事件**（taskMode=false 默认项目模式，显示当前项目 planStart/planEnd），与 v1.1.1 行为一致，非缺陷；任务事件请切「日历」tab |

> 验证：7/7 静态断言 + 前端构建通过；后端零改动。

## 22. 第四轮修复（2026-08-07，dev slot 实测反馈）

| 问题 | 修复 |
|---|---|
| 1. App.vue 日历页误改任务模式 | 去掉 `task-mode` prop，恢复项目模式（v1.1.1 一致：显示所有项目的 planStart/planEnd 事件）；任务事件只在项目详情「日历」tab |
| 2. 项目日历 tab 空白 | 日历 tab 内容 `v-show` → `v-if`（切到 tab 才挂载，避免 FC 在 display:none 容器中渲染 0 尺寸；min-height 600px 保留） |
| 3. RichEditor 编辑内容不显示 | modelValue watch 加 `{ immediate: true, flush: "post" }`（异步组件挂载晚于父级赋值的时序问题；守卫 `if (!editor.value) return` 已存在） |

> 验证：3/3 静态断言 + 前端构建通过；后端零改动。

## 21. v1.2.0 升级最终状态（2026-08-07）

### 代码变更总览

| 类别 | 改动文件数 | 备注 |
|---|---|---|
| 后端（lib / routes / tools）| 7 | db.js v3 schema + migrateToV3 顺序修复；data.js assignees/members 全链路；ui.js open-file 改 execFile；tools/ 4 文件 assignees 字段透传 |
| 前端视图 | 8 | App.vue / Project/index.vue（4 tab 改造）/ TaskTab.vue（弹窗重构）/ TaskCard.vue / ProjectMeta.vue / ProjectFormModal.vue / CalendarWidget.vue / FileTab.vue / NoteTab.vue |
| 前端组件 | 4 | RichEditor.vue（工具栏重写 + 6 扩展）/ ConfirmModal.vue / api.js / toast.js / utils/sanitize.js（新增）/ utils/asyncEditor.js（新增）/ utils/text.js / utils/richImagePreview.js（新增）|
| 入口 | 1 | main.js（Element Plus + locale + dayjs） |
| 工程 | 3 | vite.config.js（inlineDynamicImports 内联回退）/ package.json（6 个 Tiptap 扩展）/ package-lock.json |
| 元数据 | 1 | manifest.json（version 1.1.1 → 1.2.0） |
| 删除 | 2 | TaskEditor.vue / TaskFormModal.vue（被 TaskTab 内联弹窗取代） |
| 新增 | 5 | RichEditor.vue / styles/ / utils/asyncEditor.js / utils/richImagePreview.js / utils/sanitize.js / lib/sanitize.js / routes/modules/calendar.js / routes/modules/upload.js |

### 测试总览

| 阶段 | 测试项 | 结果 |
|---|---|---|
| Phase 1-5 | 全流程开发 + 单元测试 | 通过 |
| Review 批次 1+2+3 | 静态审查 29 条（2 P0 + 5 P1 + 9 P2 + 13 P3）| 全部修 |
| dev slot 第一轮 | 大日历崩溃 / P0-2 修复 / 403 Forbidden | 修通 |
| 鹏哥实测 6 项 | 弹窗/日历/富文本/日期范围 | 修 |
| P0 崩溃第二轮 | p=null 防御 | 修 |
| 鹏哥第二轮调整 10 项 | 日历 tab / 成员多选 / 弹窗重构 / 富文本加强 / 后端字段 | 修 |
| Review round 2 | 17 条（0 P0 + 2 P1 + 6 P2 + 9 P3）| P1 全修 + P2 关键 3 项修 |
| 累计单元/集成 | assignees 全链路 21/21 + 复审专项 16/16 + 核心路径回归 14/14 + 构建 + 语法 | 全部通过 |

### dev slot 验证清单（待鹏哥明天实测）

详见 `docs/acceptance-v1.2-round2-2026-08-07.md`（10 项功能调整 + 6 项 review 修复验证 + 8 项核心路径回归）。

### 未修待办（P3 为主）

| 级别 | 数量 | 说明 |
|---|---|---|
| P2 | 2 项 | P2-1 日历 tab 首屏 FC 隐藏容器初始化（待实测）/ P2-4 已完成组 draggable 跨组（待鹏哥反馈）|
| P3 | 9 项 | 文档同步、countdown 跨天、对齐组左对齐激活、色点弹层、缩进、CalendarWidget 三元化、tab 初始化白名单、弹窗 max-width、迁移注释 |

### 已知限制

- **主包体积**：v1.2.0 拆 chunk 计划因 Hana 平台 `/assets/*` 路由挂载策略不兼容回退到内联模式，gzip 588KB（原计划拆 chunk 约 478KB + 105KB）。Element Plus + Tiptap 6 扩展全内联。
- **日历 tab 首屏**：默认进入任务 tab 时 FullCalendar 在 `display:none` 容器中初始化（多一次 calendar-tasks 请求），切到日历 tab 时需要 `updateSize()` 兜底或 v-if 延迟挂载（待实测）。
- **assignee 历史数据**：v2 dev 库升级时 DROP COLUMN 会丢弃存量 assignee（鹏哥明确「不考虑历史数据」），迁移注释与文档已说明数据丢失范围。
ECHO ���ڴ�״̬��
