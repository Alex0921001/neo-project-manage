# Update: 项目管理 (neo-project-manage-v2) → v3.0.1

## 基本信息

| 项 | 值 |
| --- | --- |
| 扩展名称 | 项目管理（Project Management） |
| 类型 | `app` |
| ID | `neo-project-manage-v2` |
| 发布者 | `Alex0921001` |
| 作者仓库 | https://github.com/Alex0921001/neo-project-manage |
| Release | https://github.com/Alex0921001/neo-project-manage/releases/tag/v3.0.1 |
| 上次登记 | v3.0.0（PR #165，已合并上架） |

## 本次变更

版本 `v3.0.0` → `v3.0.1`，`approvals.json` 更新 `tag` 与 `sha256`，同时更新 `readme` 介绍正文。`registry.json` 不变。

### 1. 新增同伴卡（`panel`）

整页卡受宿主保护，不能拆窗、不能移出所属页面（`APP_PAGE_PRIMARY_MOVE_FORBIDDEN`）。本版在清单里追加一张 `pageOf` 同伴卡，属于普通卡，可以关闭、在页面间移动、拖到主页停靠。整页形态与 `siteNavEntry` 站点导航入口保持不变。

### 2. 恢复 MCP server 通道

包内新增 `mcp-server/index.js`，供 Hana 之外的工具接入同一份本地数据库，125 个工具全量暴露，stdio（line / LSP Content-Length 自动识别）与 HTTP 双模式。数据目录默认 `app-data/neo-project-manage-v2`，与 App 共用同一份 SQLite。

驱动选择交给 `lib/db.js` 统一处理（`node:sqlite` 优先），因此要求运行环境 Node.js 22+。

### 3. readme 更新内容

补充「页面形态」（整页卡与同伴卡的区别及宿主限制）、「MCP 通道」（配置方式、运行要求、权限提示）两节，并在数据与隐私里补多进程并发说明。

## 图标预览

<img src="https://raw.githubusercontent.com/Alex0921001/hana-marketplace/assets/neo-project-manage-shots/screenshots/neo-project-manage/icon.png" width="96" alt="项目管理图标">

## 界面截图

| 截图 | 说明 |
| --- | --- |
| ![项目列表](https://raw.githubusercontent.com/Alex0921001/hana-marketplace/assets/neo-project-manage-shots/screenshots/neo-project-manage/01-project-list.png) | 项目列表：按状态分组、进度与剩余天数、归档入口 |
| ![项目详情](https://raw.githubusercontent.com/Alex0921001/hana-marketplace/assets/neo-project-manage-shots/screenshots/neo-project-manage/02-task-detail.png) | 项目详情：层级任务、批注块、完成分组 |
| ![版本历史](https://raw.githubusercontent.com/Alex0921001/hana-marketplace/assets/neo-project-manage-shots/screenshots/neo-project-manage/03-version-diff.png) | 版本历史：双栏差异对照与还原入口 |

## 自测报告

### 环境

| 项 | 值 |
| --- | --- |
| Hana 版本 | 1.5.7-beta |
| 操作系统 | Windows 10.0.26200 |
| Node（构建/测试用） | 24.15.0 |
| 测试使用的 Release | v3.0.1 |

### Release 包完整性

| 检查项 | 结果 |
| --- | --- |
| Release 状态 | 正式版，非草稿、非预发布 |
| zip 大小 | 2,885,408 字节 |
| GitHub 侧摘要 | `403f3f564c1f06d84f4d756d39a36e95da0ca6fc03fb854a6dcb61a3770c238a` |
| `entry.json` 的 `archive.sha256` | 同上，一致 |
| 包内新增 | `mcp-server/index.js`，版本号 `3.0.1`，两张卡（`page` + `panel`） |

### 构建与测试

```
node scripts/validate-v2-app.mjs
→ validate-app: 0 error(s), 1 warning(s)
   warning: DYNAMIC_DEPENDENCIES_NOT_PROVEN（检查器边界说明，非缺陷）

node --test scripts/test/*.test.mjs
→ tests 134 / pass 134 / fail 0
```

### MCP server 运行验证

```
[mcp-server] started v3.0.0, dataDir: C:\Users\<用户>\.hanako\app-data\neo-project-manage-v2
initialize → {"protocolVersion":"2025-03-26","serverInfo":{"name":"neo-project-manage","version":"3.0.0"}}
[mcp-server] tools loaded: 125, framing: line + lsp(auto)
```

握手正常，125 个工具全部加载。

### 已知问题与未测部分

- 同伴卡拖到主页停靠的行为在宿主侧由用户手动验证，本次未做自动化校验
- 文件选取、打开文件、资源管理器定位依赖 Windows 桌面环境，未在 macOS / Linux 验证
- docx 方案导入依赖系统 `tar`，未在缺少该命令的环境验证
- MCP server 未在 Node 20 及以下环境验证（该环境缺 `node:sqlite`，会回退 better-sqlite3）

## 权限与外部服务

权限声明与 v3.0.0 完全一致，无新增：

| 权限 | 用途 |
| --- | --- |
| `app/resources.read` | 读取工作区外文件正文，走宿主 `ctx.resources` 通道 |
| `app/tools.expose-to-model` | 把 125 个工具暴露给模型调用 |
| `app/process.spawn` | 文件选择对话框、打开文件、资源管理器定位、docx 导入调用系统 `tar` |
| `app/ui.open-external` | 从页面打开外部链接 |
| `app/ui.clipboard-write` | 复制内容到剪贴板 |

外部服务：无。不发网络请求，无账号体系，无遥测。

需要说明的一点：包内的 MCP server 是供用户主动接入外部工具的独立进程，不会自行启动，也不由宿主拉起，因此不改变 App 本身的权限边界。

## 检查清单

- [x] `entry.json` 与 `.zip` 由官方 packer 生成，未手改大小或 SHA-256
- [x] Release 为正式版本（非草稿、非预发布），版本号高于已上架的 v3.0.0
- [x] 未替换 v3.0.0 的 Release 附件
- [x] `sha256` 照抄 `entry.json` 的 `archive.sha256`
- [x] 一个 PR 只登记一个扩展
- [x] 未手工编辑 `index.v2.json`
