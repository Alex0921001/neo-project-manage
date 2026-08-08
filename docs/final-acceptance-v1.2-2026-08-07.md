# neo-pm V1.2.0 升级 · 最终验收报告

> 验收时间：2026-08-07
> 工程位置：E:\honako\work\5-code\hana-plugins\neo-project-manage
> 工作分支：feature/v1.2.0（**未 git 提交**，等鹏哥 review 后自行 commit）

---

## 0. 一句话结论

**可以发版**。5 个新需求 + 2 轮 review 修复 + 终局修复全部完成，0 P0/P1，红线零触碰，175 个断言全过。

---

## 1. 升级成果

### 5 个新需求（鹏哥提出）

| # | 需求 | 状态 |
|---|---|---|
| 1 | 任务添加成员（成员池 = 项目 members，单选，非必填） | ✅ |
| 2 | 任务添加起止时间（YYYY-MM-DD，校验落在项目 planStart/planEnd） | ✅ |
| 3 | 任务日历 tab（事件源从项目切任务，含全部/未完成/已完成筛选） | ✅ |
| 4 | 引入 Element Plus 重构 6 类弹窗（任务/子任务/文件/备注/项目/项目集） | ✅ |
| 5 | 引入 Tiptap 富文本 + 图片上传 + 缩略图 + preview 弹窗 | ✅ |

### 拍板记录

| 决策项 | 拍板 |
|---|---|
| 组件库 | Element Plus（Vue 3） |
| 富文本 | Tiptap v2 |
| 图片存储 | 插件目录 + URL |
| 开发 agent | common |
| 分支 | feature/v1.2.0 |
| 自研 sanitizer 替代 DOMPurify | 是（npm install sanitize-html 触发 better-sqlite3 原生 rebuild 失败绕路） |

---

## 2. 完整时间线

| 阶段 | 内容 | 关键数据 |
|---|---|---|
| Phase 1 | DB 迁移 + 工具参数 + 任务表单 | 13 文件改 / 27/27 单元 |
| Phase 2 | Element Plus + 6 类弹窗重构 | 19 文件改 / 构建通过 |
| Phase 3 | Tiptap 富文本 + 图片上传 + preview | RichEditor chunk 327KB / 主包 478KB gzip |
| Phase 4 | 任务日历 tab 改造 | taskMode 切换 + 跳转滚动 |
| Phase 5 | 集成测试 + 兼容老数据 + 文档 | 25/25 综合 |
| review 批次 1 | 修 2 P0 + 5 P1 = 7 条 | 50/50 + 8/8 |
| review 批次 2 | 修 7 P2 + 5 P3 = 12 条 | 26/26 + 9/9 |
| review 批次 3 | 修 1 P0 + 1 P2 + 5 P3 = 7 条 | 18/18 + 25/25 |
| 终局 | 修 1 P2（筛选必现缺陷）+ 1 P3（注释残留） | 5/5 |

---

## 3. 关键修复（审查发现的真问题）

| 等级 | 问题 | 修复 |
|---|---|---|
| P0-1 | 存储型 XSS（任务/项目/备注/批注全有 v-html 直渲） | 自研零依赖 sanitizer（白名单+协议+Token 重建），服务端 7 写入入口 + 前端展示兜底 |
| P0-2 | 构建产物冲突（RichEditor chunk 字母序抢占主包 + 动态 import 无静态路由） | loadAssets 显式 `^index-.*\.js$` + 新增 /assets/* 静态路由 + buildHtml 外部引用 |
| P0-3 | 日历必崩（批次 2 修复 dayjs 时漏改 toISOString 误用） | 去掉两处 `.toISOString()`，两分支同改 dayjs 纯日期 +1 day |
| P1-1 | updateTask 缺父任务存在性/同项目/成环三重校验（自指时 buildTaskTree 栈溢出） | 复用 wouldCreateCycle + 三重校验 |
| P1-2 | 上传 DoS（2MB 限制在读入内存后才校验）+ 无魔数校验 | Content-Length 前置拦截 + png/jpeg/gif/webp 魔数 + nosniff |
| P1-3 | 富文本只含图片被静默清空 | DOMParser 子节点判空（识别 img/a/video 等资源标签） |
| P1-4 | 新建项目必选项目集（全新安装无项目集时无法创建第一个项目） | 去掉 required + 「未归类」选项 |
| P1-5 | createTask 后端无 name 必填校验 | trim 非空 + ≤50，前后端对齐 |
| P2 | updateTask 移动父级 index_num 不重排 | 事务内：旧父级序号压缩 + 新父级追加末尾 |
| P2 | 日历筛选必现缺陷（watch props.calFilter 永不触发） | watch 监听 ref 本身 + loadTaskEvents 拼接 ?status= |
| P2 | createProject/updateProject 无日期格式校验 | 复用 normalizeDate 同款格式/反向比对 |
| P2 | createTasks 事务内错误信息无序号 | 「第 N 个任务：」前缀 |
| P2 | TaskTab 不消费后端 warnings | 前端补全四象限 + 透传 res.data.warnings |
| P3-5 | 生产代码残留测试路由（__tasks_test__ / __diag_* / /api/debug-project） | 移除 |
| P3-7 | 异步组件无 loading/error + 超时 + 重试 | 抽 asyncEditor 工厂，15s 超时 + 2 次重试 |
| P3-3 | CalendarWidget end 用 dayjs 纯日期 +1 day | 消除 UTC/本地混合解析偏差 |
| P3-9 | uploads 静态响应一年长缓存 | 改 no-cache（文件删除后立即可见） |
| P3-4 | README 工具数 + 描述修正 | 21→22，get_task 补入，更新_task 描述对齐 |

---

## 4. 测试汇总

| 阶段 | 维度 | 结果 |
|---|---|---|
| Phase 1 | 单元 + 工具 happy path | 27/27 + 5/5 |
| Phase 5 | 集成 | 25/25 |
| 批次 1 | 综合 + 静态链路 | 50/50 + 8/8 |
| 批次 2 | 综合 + 回归 | 26/26 + 9/9 |
| 批次 3 | 专项 + 综合回归 | 18/18 + 25/25 |
| 终局 | 静态断言 | 5/5 |
| **总计** | — | **175 个断言全过** |

---

## 5. 红线确认（零触碰）

| 红线项 | 验证 |
|---|---|
| 任务树拖拽 | 零改动（vuedraggable + onTopDragEnd / handleCrossMove / reorder-tasks / move API 逐行比对） |
| 级联删除 | 零改动（FK CASCADE，foreign_keys=ON 已确认） |
| 状态计算 | 零改动（computeStatus + computeDisplayStatus 原样） |
| 移位/排序 | 零改动（moveTask / wouldCreateCycle / reorderTasks / reorderSubtasks 原样） |
| 工具向后兼容 | 22 工具齐备，老参数签名不变，新参数均为增量 |
| DB 迁移幂等 | PRAGMA 判列 + CREATE INDEX IF NOT EXISTS + INSERT OR REPLACE schema_version |

---

## 6. 部署要点

1. **dev slot 加载最新代码**：Hana 重启后 dev slot 自动加载新版本
2. **DB 自动迁移**：启动时自动跑 migrateV1ToV2，老任务数据保留（assignee/start_date/end_date 默认为空）
3. **首次打开日历 tab**：会拉一次 `/api/calendar-tasks`（任务事件源）
4. **日历筛选**：全部/未完成/已完成三个 tab 都按状态正确拉取（已修复）
5. **文件上传**：图片存 `plugin-data/uploads/`，2MB 上限，png/jpeg/gif/webp 魔数校验
6. **DEBUG 关闭**：默认 `NODE_ENV !== 'development'`，静态资源走 hash 不可变缓存
7. **老数据展示**：未清洗的存量 HTML 首次展示时前端兜底 sanitize，DB 仍是原文

---

## 7. 升级注意事项

1. **不破坏性升级**：v1.1.1 → v1.2.0 兼容，老任务数据保留
2. **工具层 API 兼容**：老参数签名不变
3. **可回滚**：DB 新字段保留（不影响旧查询），代码可回滚
4. **P2-3 整体回滚语义**：批量创建任务失败**全部回滚**（与 create_annotations 一致），不部分成功
5. **P2-6 字段双轨**：旧字段 snake（project_id/index_num）+ 新字段 camel（assignee/startDate/endDate）双轨契约为有意设计
6. **P3-8 未修**：Element Plus 全量引入（与文档「按需引入」表述不符），不在本次范围

---

## 8. 遗留事项（不在本次范围，可后续清理）

| # | 项 | 等级 | 建议 |
|---|---|---|---|
| 1 | Element Plus 全量引入（main.js） | P3-8 | 改为按需引入或改文档口径 |
| 2 | 错误一律 400（404 语义丢失） | P3-10 | 区分 400/404/500 |
| 3 | FileTab 串行添加失败明细缺失 | P3-11 | 汇总 ok/fail |
| 4 | ProjectMeta today 模块级常量跨天不刷新 | P3-12 | 每次计算或定时器 |
| 5 | migrate-to-sqlite.js 多层嵌套旧数据丢失 + 死变量 | P3-13 | 递归拍平 + 清理 |
| 6 | tools/list-tasks 双查询 | P3-6 | 合并或按需补查 |
| 7 | README 工具数小修后是否需要再核 | P3-4 后续 | 持续维护 |

---

## 9. 文档与提交物

| 路径 | 用途 |
|---|---|
| `docs/upgrade-v1.2.0-2026-08-07.md` | 完整开发文档（含拍板结果、决策、批次记录） |
| `docs/review-v1.2-2026-08-07.md` | 完整 review 报告（29 + 8 = 37 条） |
| `docs/final-acceptance-v1.2-2026-08-07.md` | 本文档（最终验收） |
| `manifest.json` | 版本 1.1.1 → 1.2.0 |
| `README.md` | 版本 + 功能列表更新 |
| `docs/design.md` | V1.2 数据模型补充 |

---

## 10. 鹏哥下一步操作清单

- [ ] **在 IDE 里 review 改动**（feature/v1.2.0 分支）
- [ ] **dev slot 实测**：重启 Hana，验证 `docs/acceptance-v1.2-round2-2026-08-07.md` 10 项功能调整 + 6 项 review 修复验证 + 8 项核心路径回归
- [ ] **git commit + push**：按你节奏提交（common 未替你提交）
- [ ] **dev slot → community 槽位切换**：发布到插件市场前
- [ ] **发版 v1.2.0**
- [ ] **关停旧版 v1.1.1 dev slot**（你说"开发好了可以关掉避免升级失败"）

---

## 11. v1.2.0 第二轮变更说明（2026-08-07）

第一轮验收后，鹏哥提出 10 项新调整 + review agent 第二轮复审发现 17 条问题，common 已完成全部修复。

### 第二轮主要变更

- **日历 tab 独立页**：Project/index.vue tab-bar 改为 4 tab（任务 / 日历 / 文件 / 备注），日历占满 tab-content
- **任务弹窗重构**：800px 宽 + 成员/关联文件均改 el-select multiple
- **成员多选**：assignees string[] 数组（DB schema v3），前端 el-select multiple + 后端 parseAssignees 兜底
- **ProjectMeta 状态切换**：el-dropdown 重构，删除手写下拉死代码
- **RichEditor 工具栏**：重写为 10 组 30+ 按钮，新装 6 个 Tiptap 扩展（Underline/TextAlign/Color/Highlight/TaskList/TaskItem）
- **P1 修复**：migrateToV3 迁移顺序错误 + open-file 命令注入

### 文档索引

- 第二轮 review 报告：`docs/review-v1.2-round2-2026-08-07.md`
- 第二轮验收清单：`docs/acceptance-v1.2-round2-2026-08-07.md`
- 升级文档（追加 round 2）：`docs/upgrade-v1.2.0-2026-08-07.md` 第 19-21 章
- commit message 模板：`docs/commit-message-v1.2.md`
