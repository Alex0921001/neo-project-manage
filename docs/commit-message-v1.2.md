# v1.2.0 Commit Message 模板

> 给鹏哥手动 commit 用（置顶记忆：不用 git 提交代码）

## 推荐结构（1 个 commit）

```
feat(v1.2.0): 任务弹窗/日历/富文本全面重构

5 大需求落地 + 防御性修复 + 5 轮精修 + 文档同步：

【新增功能】
- 任务弹窗成员多选（assignees string[]，DB schema v3）
- 任务弹窗起止日期 daterange 选择器
- 任务弹窗关联文件多选（el-select multiple）
- 项目成员多选（el-select multiple + 全局聚合候选池）
- 日历 tab 独立页（Project/index.vue 4 tab 改造）
- 大日历项目模式筛选（全部/未完成/已完成）
- ProjectMeta 状态切换重构（el-dropdown）
- RichEditor 工具栏重写（10 组 30+ 按钮）
- 富文本插图（≤2MB png/jpg/jpeg/gif/webp）
- 富文本剪贴板粘贴图片（Ctrl+V 自动上传）
- 弹窗统一 Element Plus（el-dialog + el-form + rules）
- 文件选择对话框（dev slot 模式下不可用）

【数据库】
- schema v3：assignees TEXT 存 JSON 数组
- migrateToV3 幂等兼容 v1/v2 老库（v2 库先 DROP INDEX 再 DROP COLUMN）
- 新增 idx_tasks_start_date / idx_tasks_end_date 索引

【防御性修复】
- 大日历初始化崩溃（taskEvents 数组检查 + try/catch + onErrorCaptured）
- Project/index.vue p=null 时 p.files 裸访问崩溃（改 p?.files）
- migrateToV3 迁移顺序（v2 库不再炸）
- open-file 命令注入（execFile + 参数数组 + -LiteralPath）
- status 白名单校验（非法值抛 400）
- members JSON 解析兜底（对齐 parseAssignees）+ 数组校验 + trim + 去重
- CalendarWidget fcOptions 异常返回空事件（不拖垮页面）

【5 轮精修】
- 第 1 轮 6 项：大日历崩溃防御 / 任务弹窗日历 tab / 富文本粘贴 / 编辑器样式 / 日期 range / 中文化
- 第 2 轮 10 项：日历 tab 独立页 / 任务弹窗重构 / assignees 字段 / ProjectMeta 状态 / ProjectFormModal 成员 / RichEditor 工具栏加强 30+ 按钮
- 第 2 轮 review 修复：P1 全部 2 项 + P2 关键 3 项
- 第 3 轮 3 项：日历高度 600px / 任务日历 tab 空白 / 右侧小日历 580px
- 第 4 轮 3 项：App.vue 日历页回项目模式 / 任务日历 tab v-if 延迟挂载 / RichEditor watch immediate+flush:post
- 第 5 轮 4 项：RichEditor onCreate 唇底异步时序 / 项目模式外层筛选 visibleProjects / 任务日历 tab updateSize / RichEditor 视觉 320px 30px 斜体 I

【工程】
- main.js Element Plus + zh-cn locale + dayjs locale
- vite.config.js inlineDynamicImports（内联回退模式，绕开 Hana /assets/* 路由挂载限制）
- 删除 TaskEditor.vue / TaskFormModal.vue（被 TaskTab 内联弹窗取代）
- 自研零依赖 sanitizer 替代 DOMPurify（避免 npm install 触发 better-sqlite3 rebuild）

【依赖（frontend）】
- @tiptap/extension-underline
- @tiptap/extension-text-align
- @tiptap/extension-color
- @tiptap/extension-highlight
- @tiptap/extension-task-list
- @tiptap/extension-task-item

【测试覆盖】
- assignees 全链路 21/21（v1→v3 / v2→v3 迁移、JSON 存取、脏数据兜底、筛选、日历、工具）
- Review 复审专项 16/16（v2 带索引库迁移 / open-file 转义与 execFile / status 白名单 / members 契约 / 死代码）
- 核心路径回归 14/14（XSS / 校验 / 重排 / 批量事务 / 上传 / 级联）
- 前端 npm run build 通过（单文件 index-*.js 1.8MB / gzip 588KB）
- 后端语法检查 7 文件全过

【已知限制（待 P3 后续）】
- 主包 gzip 588KB（Element Plus + Tiptap 全内联，原计划拆 chunk 因 Hana 平台兼容性回退）
- 任务日历 tab v-if 延迟挂载 + updateSize 唇底（未拆鲁奂）
- 9 项 P3 留待后续（文档同步、countdown 跨天、对齐组激活、色点弹层等）

【文档】
- docs/upgrade-v1.2.0-2026-08-07.md（21 章完整记录）
- docs/review-v1.2-2026-08-07.md（第一轮 review）
- docs/review-v1.2-round2-2026-08-07.md（第二轮 review）
- docs/acceptance-v1.2-round2-2026-08-07.md（第二轮验收清单）
- docs/final-acceptance-v1.2-2026-08-07.md（最终验收）
- docs/commit-message-v1.2.md（本文件）
- docs/design.md（设计文档同步）
- README.md（功能描述同步）
```

## 推荐命令

```bash
# 1 个 commit（推荐，简洁）
git add -A
git commit -F docs/commit-message-v1.2.md

# 推送到 GitHub
git push origin feature/v1.2.0
```

## 已知问题（待鹏哥回家修复）

1. App.vue 全局日历页筛选（visibleProjects 修复已铺，但需要验证）
2. 任务日历 tab v-if 延迟挂载 + updateSize（补救后仍需验证）
3. RichEditor onCreate 异步时序（理论上唇底）
4. RichEditor 视觉（320px / 30px / 斜体 I）
5. 富文本粘贴图片（handlePaste）
6. 右侧小日历高度 580px
```

## 状态快照

- 分支：`feature/v1.2.0`
- dev slot：`dev_1786151198909_00e0f0c7a660`（已加载新 build 1783afb5）
- 无后端代码改动（仅 1 项 open-file 转义 + status 白名单）
- DB 迁移幂等，老库自动兼容
