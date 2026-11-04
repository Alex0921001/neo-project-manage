# Enroll: 项目管理 (neo-project-manage-v2)

## 基本信息

| 项 | 值 |
| --- | --- |
| 扩展名称 | 项目管理（Project Management） |
| 类型 | `app` |
| ID | `neo-project-manage-v2` |
| 发布者 | `Alex0921001` |
| 作者仓库 | https://github.com/Alex0921001/neo-project-manage |
| Release | https://github.com/Alex0921001/neo-project-manage/releases/tag/v3.0.0 |
| 用途 | 面向人与 Agent 共用的项目管理：项目集/项目/树形任务/需求/方案/评论/版本/验证/临时任务/消息中心/全文检索/周报与风险识别 |

### 它做什么

页面侧用来安排项目与任务，Agent 侧通过 125 个工具直接读写同一份本地数据，两边不靠复制粘贴同步。

### 本次登记说明

首次登记，无历史条目变更。

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
| 测试使用的 Release | v3.0.0 |

### 本地校验结果

```
node scripts/validate-v2-app.mjs
→ validate-app: 0 error(s), 1 warning(s)
   warning: DYNAMIC_DEPENDENCIES_NOT_PROVEN（静态检查只跟踪声明的 UI HTML/CSS 资源，
            动态 import、运行时拼接 URL、网络响应不在证明范围。属检查器本身的边界说明，非缺陷。）
```

```
node --test scripts/test/*.test.mjs
→ tests 134 / pass 134 / fail 0
```

覆盖范围：数据层迁移、工具层读写、批量操作范式（事务回滚与逐条独立）、方案导入、任务↔方案关联、消息聚合、全文检索（FTS5 trigram）、评论划词锚点、验证证据回填、断言校验。

### 安装验证（已实测）

从本次登记的 Release `v3.0.0` 下载安装包，校验后进行安装。

| 步骤 | 结果 |
| --- | --- |
| Release 附件 sha256 与 `entry.json` 记录比对 | 一致（`1a5df3f77efabb861c026b5efe8e6b51e29e8811ceba8c5f79b2c90087ab76ec`） |
| 从 Release 包安装 | 成功，哈希 `8b96e762a3e7963176e5a2b7317448dc129b4b9332236e96da1c83748f4701b4` |
| 打开「项目管理」页面 | 正常 |
| 启动时接管既有数据库 | 成功，`PRAGMA integrity_check` 返回 `ok`，34 张表齐备 |
| 数据完整性（安装后逐表核对） | 项目 31、任务 263、方案 44、需求 59、批注 63、验证项 163、审计 2,784，与安装前一致 |
| Agent 工具调用 | 正常 |

### 已知问题与未测部分

- 文件选取、打开文件、资源管理器定位依赖 Windows 桌面环境，未在 macOS / Linux 验证
- docx 方案导入依赖系统 `tar`（Windows 10 1803+ 内置），未在缺少该命令的环境验证
- 未做多实例并发写入压测

## 权限与外部服务

| 权限 | 用途 |
| --- | --- |
| `app/resources.read` | 读取工作区外文件正文（项目文件资产的「读取内容」）。走宿主 `ctx.resources` 通道，是 v2 沙箱内唯一合法的读盘外入口 |
| `app/tools.expose-to-model` | 把 125 个工具暴露给模型调用 |
| `app/process.spawn` | 桌面能力：系统文件选择对话框、打开文件、资源管理器定位、导入 docx 时调用系统 `tar` 解压 |
| `app/ui.open-external` | 从页面打开外部链接 |
| `app/ui.clipboard-write` | 复制任务/方案内容到剪贴板 |

外部服务：无。不发网络请求，无账号体系，无遥测。

数据位置：宿主应用数据目录下的 `projects.sqlite`（WAL 模式），卸载不删除。

## 检查清单

- [x] `entry.json` 与 `.zip` 由官方 packer 生成，未手改大小或 SHA-256
- [x] Release 为正式版本（非草稿、非预发布）
- [x] `registry.json` 与 `approvals.json` 在同一个 PR 内修改
- [x] `sha256` 照抄 `entry.json` 的 `archive.sha256`
- [x] 未手工编辑 `index.v2.json`
- [x] 从 Release 安装并验证
- [x] 图标与截图已贴入正文
