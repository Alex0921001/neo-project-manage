# neo-pm V1.2.0 升级审查报告

> 审查对象：feature/v1.2.0 分支全量改动
> 审查时间：2026-08-07
> 审查者：review agent
> 红线验证：拖拽/级联删除/状态计算/移位/排序 **零改动确认** ✅；工具参数向后兼容 **确认** ✅；DB 迁移幂等 **确认** ✅

---

## 等级统计

| 等级 | 数量 | 说明 |
|---|---|---|
| **P0** | **2** | 必修，不修不能用 |
| P1 | 5 | 强烈建议，不修有真实风险 |
| P2 | 9 | 可改进，修后体验更稳 |
| P3 | 13 | 建议，锦上添花 |
| **总计** | **29** | |

---

## 一、P0 必修（2 条）

| # | 位置 | 问题 | 修改方向 |
|---|------|------|---------|
| 1 | `frontend/src/utils/text.js` `formatDescription()` + 渲染点（TaskCard:79、NoteTab:45、ProjectMeta:85、AnnotationPanel:36） | **存储型 XSS**：`v-html` 直渲，`formatDescription` 启发式判定绕得掉；Agent 工具/REST 可写任意 HTML，Tiptap 拦不住 API 路径 | 渲染前统一 sanitize（DOMPurify 白名单：p/br/ul/ol/li/h1-6/strong/em/img/a + 受限属性），或服务端 7 个写入入口统一清洗 |
| 2 | `routes/ui.js` `loadAssets()` + `frontend/dist/assets/` | **构建产物加载冲突**：Vite 拆出 RichEditor-*.js chunk，NTFS 字母序下排在 index-*.js 前面，`assets.find(f=>f.endsWith(".js"))` 取到 chunk 当主包内联，页面白屏；动态 import 的 chunk 无 `/assets/*` 静态路由 → 404 | `loadAssets` 显式匹配 `index-*.js`/`index-*.css`；为 dist/assets 注册静态服务路由；或 vite 配置 `inlineDynamicImports` 放弃拆 chunk |

---

## 二、P1 强烈建议（5 条）

| # | 位置 | 问题 | 修改方向 |
|---|------|------|---------|
| 1 | `lib/data.js` `updateTask()` parentTaskId 分支 | 缺父任务存在性/同项目归属/成环自指三重校验；task 自指时 `buildTaskTree` 栈溢出 → 整个项目页崩溃 | 复用 `wouldCreateCycle` + 同项目校验；或该字段走拒绝，移动统一走 `moveTask` |
| 2 | `routes/modules/upload.js` `parseBody → arrayBuffer` | 2MB 限制在文件**读入内存后**才校验（DoS 面）；`saveUploadedFile` 仅查扩展名不查魔数 | 按 Content-Length 前置拦截或流式读取；补文件头 magic bytes + `X-Content-Type-Options: nosniff` |
| 3 | `frontend/src/utils/text.js` `normalizeRichText()` | 富文本只含图片时去标签后为空 → 返回空串，图片被静默清空 | 按 DOM 子节点（识别 img 等自闭合资源标签）判空 |
| 4 | `views/Home/components/ProjectFormModal.vue` `rules.projectSetId` required | 前端强制必选项目集，后端允许 NULL（未归类是明确语义）；**全新安装无项目集时 select 无选项 → 无法创建第一个项目** | 去掉 required 或后端同步必选并处理空集引导 |
| 5 | `lib/data.js` `createTask()` | 后端无 name 必填/长度校验（前端 rules 与文档声明 1-50 必填），REST/工具可建空名任务 | createTask 补 `trim()` 非空 + ≤50 校验 |

---

## 三、P2 可改进（9 条）

| # | 位置 | 问题 | 修改方向 |
|---|------|------|---------|
| 1 | `lib/data.js` `normalizeDate()` | `new Date("2026-02-30T00:00:00")` 溢出到 3 月不返回 NaN，非法日期可入库 | 拆 Y/M/D 手工回填校验 |
| 2 | `lib/data.js` `createProject/updateProject` | 项目 planEnd < planStart 无校验（任务有硬校验，项目没有） | 与任务一致补 end >= start 硬校验 |
| 3 | `tools/create-tasks.js` | 批量创建无事务：第 N 条失败时前 N-1 条已落库 | 事务包裹或返回部分成功清单 |
| 4 | `views/Project/components/TaskFormModal.vue` | 死代码：全仓库无 import；`emit("warn")` 未在 defineEmits 声明 | 删除或接入并补事件声明 |
| 5 | `lib/data.js` `saveUploadedFile()` | 仅扩展名白名单无文件头校验（已含 P1-2） | 魔数校验 + 服务端扩展名/MIME 双确认 |
| 6 | `lib/data.js` `buildTaskTree()/taskRowToObject()` | 输出字段双轨制：snake + camel 并存 | 统一 camelCase，前端同步清理 |
| 7 | `lib/data.js` `noteContentEmpty()` | 备注只含图片时去标签为空 → 被拒（与 P1-3 同根） | 识别资源标签后判空 |
| 8 | `lib/data.js` `validateTaskDates()` | 仅 startDate<planStart / endDate>planEnd 两种提示；组合越界零提示 | 补全越界组合 |
| 9 | `ProjectFormModal.vue` RichEditor | 新建项目时插图按钮无禁用态，点击才抛错 | 无 projectId 时禁用图片按钮 + 行内提示 |

---

## 四、P3 建议（13 条）

| # | 位置 | 问题 | 修改方向 |
|---|------|------|---------|
| 1 | `CalendarWidget.vue` 任务事件 title | 仅显示任务名，多项目同名无法区分 | title 拼接 projectName |
| 2 | `CalendarWidget.vue` | 切筛选重新请求 API + 本地再过滤（双重冗余） | 一次拉全量本地过滤 |
| 3 | `CalendarWidget.vue` end 计算 | `new Date(dateStr)+1天` UTC/本地混合解析，UTC- 时区有一天偏差风险 | 统一用 dayjs 纯日期运算 |
| 4 | `README.md` | 工具总数写 21（manifest 实际 22，漏 get_task）；`update_task` 描述含未暴露参数 | 修正数量与表格，工具描述对齐 |
| 5 | `routes/ui.js` / `tasks.js` | 生产代码残留 `__tasks_test__`、`__diag_*`、`/api/debug-project` 测试路由 | 移除或环境开关 |
| 6 | `tools/list-tasks.js` | 额外全量 `listTasks()` 构建 idToName 映射 | 与主查询合并或按需补查 |
| 7 | `TaskTab/NoteTab/ProjectFormModal` 的 `defineAsyncComponent` | 无 loading/error 组件与 timeout，chunk 加载失败静默空白 | 补 errorComponent + 重试 |
| 8 | `main.js` | Element Plus 全量引入，与文档「按需引入」表述不符 | 按需引入或文档改口径 |
| 9 | `upload.js` GET /files/:name | `max-age=31536000` 一年长缓存，文件删除后缓存残留 | 缩短缓存或加版本号 |
| 10 | 全部路由模块 | 错误一律 400（404 场景语义丢失） | 区分 400/404/500 |
| 11 | `FileTab.vue` confirmAdd | 串行逐条添加，失败明细缺失 | 汇总 ok/fail 明细 |
| 12 | `ProjectMeta.vue` | `dayjs()` today 模块级常量，跨天不刷新 | 每次计算或定时器刷新 |
| 13 | `scripts/migrate-to-sqlite.js` | 任务只拍平两层（子任务），多层嵌套旧数据丢失；`taskIndexMap` 死变量 | 递归拍平 + 清理死代码 |

---

## 五、common 主动标的 4 点评估

| 评估点 | 结论 |
|--------|------|
| A1 FileTab 不用 el-upload | **合理**。桌面集成需要真实本地路径（双击打开），el-upload 浏览器文件流拿不到路径；el-dialog + pick-file + 已选列表是正确取舍 ✅ |
| A2 TaskTab 内联表单 → el-dialog | **联动未受影响**。dialog 与列表完全解耦；拖拽/移位走 vuedraggable + move API 独立路径，便利贴走 DOM 定位 ✅ |
| A3 新建项目插图不可用 | 功能可接受（编辑时可补），但交互提示生硬，见 P2-9 |
| A4 红线零改动 | **验证通过** ✅ |

---

## 六、给 common 的处理建议

- **P0-2**（chunk 加载）务必先复现一次 `vite build` 后的实际页面加载确认
- **P0-1**（XSS）建议服务端入口统一 sanitize 一次性解决四个渲染点
- **P1** 按顺序处理即可
- **P2/P3** 视工期选择性修复
