## 项目管理 v3.0.1

在 v3.0.0 基础上补两项能力：可拖到主页停靠的同伴卡，以及恢复的 MCP 通道。

### 安装包

| 文件 | 说明 |
| --- | --- |
| `app-neo-project-manage-v2-3.0.1.zip` | 应用安装包 |
| `app-neo-project-manage-v2-3.0.1.entry.json` | 条目元数据，含 `archive.sha256` 与权限声明 |

### 本版变更

**新增同伴卡（`panel`）**

整页卡受宿主保护，不能拆窗、不能移出所属页面（`APP_PAGE_PRIMARY_MOVE_FORBIDDEN`）。本版在清单里追加一张 `pageOf` 同伴卡，它是普通卡，可以关闭、在页面间移动、拖到主页停靠。整页形态与站点导航入口保持不变。

**恢复 MCP server 通道**

包内新增 `mcp-server/index.js`，供 Hana 之外的工具接入同一份本地数据库。125 个工具全量暴露，支持 stdio（line / LSP Content-Length 自动识别）与 HTTP 两种模式。

```
MCP_DATA_DIR   数据目录，默认 <用户目录>/.hanako/app-data/neo-project-manage-v2
MCP_PORT       设置后改用 HTTP 模式；不设置则走 stdio
```

启动要求 Node.js 22 及以上（依赖内置 `node:sqlite`）。驱动的选择交给 `lib/db.js` 统一处理，不再做 vendor ABI 探测。

接入示例：

```json
{
  "mcpServers": {
    "neo-project-manage": {
      "command": "node",
      "args": ["<HANA_HOME>/apps/neo-project-manage-v2/mcp-server/index.js"]
    }
  }
}
```

注意它授予外部进程完整写权限，误调用会直接改到真实项目数据。

### 其余能力

与 v3.0.0 一致：项目集 / 项目 / 任意层级任务 / 便利贴批注 / 需求 / 方案 / 统一评论 / 版本快照 / 验证卡与验证项 / 临时任务 / 消息中心 / 全文检索 / 风险识别 / 周报生成 / 审计追踪。

### 权限

`app/resources.read`、`app/tools.expose-to-model`、`app/process.spawn`、`app/ui.open-external`、`app/ui.clipboard-write`。无新增权限。

### 兼容性

- 最低 Hana 版本：`1.1.0-beta`
- 文件选取、打开文件、资源管理器定位依赖 Windows 桌面环境
- docx 方案导入依赖系统 `tar`（Windows 10 1803+ 内置）
- MCP server 需 Node.js 22+
