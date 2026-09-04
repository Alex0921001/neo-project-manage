#!/usr/bin/env node
/**
 * neo-project-manage MCP Server
 *
 * 零外部依赖，直接实现 MCP 协议（JSON-RPC 2.0 over stdio / HTTP）。
 * stdio 传输双 framing 兼容：
 *   - line（换行分隔 JSON）：MCP 官方 stdio 标准，Claude Code / Cursor 等 harness 使用
 *   - lsp（Content-Length 分帧）：兼容既有客户端
 *   响应自动跟随请求的 framing 格式。
 * 数据默认指向当前用户的 Hana 正式版数据目录，与 Hana 插件共享同一份 SQLite（WAL 多进程安全）。
 *
 * 使用方式（在项目根目录下）：
 *   node mcp-server/index.js
 *
 * 环境变量：
 *   MCP_DATA_DIR   - 数据目录（默认 %USERPROFILE%/.hanako/plugin-data/neo-project-manage）
 *   MCP_PORT       - HTTP 模式端口（可选，不传则走 stdio 模式）
 *
 * vendor ABI：lib/vendor/better-sqlite3 为 Hana 宿主（Electron）ABI 编译；
 * 启动时自动探测，与本机 Node ABI 不匹配则自动降级 node_modules 版（需先 npm install）。
 */

import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");

// ── 配置 ──────────────────────────────────────────────
const DATA_DIR = process.env.MCP_DATA_DIR || path.join(
  process.env.USERPROFILE || process.env.HOME || "C:/Users/default",
  ".hanako/plugin-data/neo-project-manage"
);

// 版本号与插件 id 从 manifest.json 读取，不再写死
let MANIFEST = { id: "neo-project-manage", version: "0.0.0" };
try {
  MANIFEST = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "manifest.json"), "utf-8"));
} catch { /* manifest 缺失时用兜底值 */ }
const SERVER_INFO = {
  name: MANIFEST.id || "neo-project-manage",
  version: MANIFEST.version || "0.0.0",
};
const MCP_PROTOCOL_VERSION = "2025-03-26";

// ── vendor ABI 探测（必须在动态 import tools 之前执行） ──
// 子进程试加载 vendor 原生模块：ABI 不匹配会非零退出，此时降级 node_modules 版
function vendorAbiCompatible() {
  const vendorNative = path.join(PLUGIN_ROOT, "lib", "vendor", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  if (!fs.existsSync(vendorNative)) return false;
  try {
    execFileSync(process.execPath, ["-e", `require(${JSON.stringify(vendorNative)})`], {
      stdio: "ignore",
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}
if (!vendorAbiCompatible()) {
  process.env.NVM_SKIP_VENDOR = "1";
  console.error("[mcp-server] vendor native ABI mismatch, fallback to node_modules better-sqlite3");
}

// ── 加载工具（动态扫描 tools/，新增工具自动纳入） ──────
const toolsDir = path.join(PLUGIN_ROOT, "tools");
const toolFiles = fs.readdirSync(toolsDir)
  .filter(f => f.endsWith(".js"))
  .sort();

const tools = [];
for (const file of toolFiles) {
  const mod = await import(pathToFileURL(path.join(toolsDir, file)).href);
  tools.push({
    name: mod.name,
    description: mod.description,
    inputSchema: mod.parameters,      // MCP 的 inputSchema 字段
    execute: mod.execute,
  });
}

// ── MCP JSON-RPC 处理器 ───────────────────────────────

/** 已初始化的 session 集合（防重复初始化） */
const initializedSessions = new Set();

/** 处理 MCP 请求 */
async function handleRequest(request) {
  const { id, method, params } = request;

  // 通知类（无 id，不需要响应）
  if (id === undefined || id === null) {
    if (method === "notifications/initialized") {
      // 客户端通知初始化完成，可忽略
    }
    // 其他通知忽略
    return null;
  }

  // ── initialize ──
  if (method === "initialize") {
    initializedSessions.add(id);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: SERVER_INFO,
      },
    };
  }

  // 未初始化拒绝
  if (!initializedSessions.size) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: "Server not initialized" },
    };
  }

  // ── tools/list ──
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }

  // ── tools/call ──
  if (method === "tools/call") {
    return await handleToolCall(id, params);
  }

  // ── 未知方法 ──
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

/** 处理工具调用 */
async function handleToolCall(id, params) {
  const { name, arguments: args } = params || {};
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: `Unknown tool: ${name}` },
    };
  }

  try {
    const result = await tool.execute(args || {}, { dataDir: DATA_DIR });
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err.message || String(err),
      },
    };
  }
}

// ── Stdio 传输（双 framing：line = MCP 官方标准 / lsp = Content-Length 兼容） ──

/** 跨消息保留的 stdin 缓冲（同一 chunk 可能包含多条消息） */
let stdinBuffer = Buffer.alloc(0);

/**
 * 从 stdin 读取一条消息
 * @returns {Promise<{text: string, framing: "line"|"lsp"}>} framing 标识本条请求使用的分帧格式，响应需跟随
 */
function readStdinMessage() {
  return new Promise((resolve, reject) => {
    let settled = false;

    // 尝试从缓冲中解析一条完整消息；成功则消费并 resolve
    const tryParse = () => {
      if (settled) return true;
      // 跳过前导空白（容忍客户端在消息间插入空行/空白）
      let start = 0;
      while (start < stdinBuffer.length) {
        const b = stdinBuffer[start];
        if (b === 0x20 || b === 0x09 || b === 0x0d || b === 0x0a) start++;
        else break;
      }
      if (start >= stdinBuffer.length) {
        if (start > 0) stdinBuffer = Buffer.alloc(0); // 全是空白，丢弃
        return false;
      }
      if (start > 0) stdinBuffer = stdinBuffer.slice(start);

      const head = stdinBuffer.slice(0, 15).toString("utf-8").toLowerCase();
      if (head === "content-length:") {
        // ── LSP framing（Content-Length 分帧，兼容既有客户端） ──
        const headerEnd = stdinBuffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return false; // 头部未完整
        const headerStr = stdinBuffer.slice(0, headerEnd).toString("utf-8");
        const match = headerStr.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          settled = true;
          reject(new Error("Missing Content-Length header"));
          return true;
        }
        const bodyLength = parseInt(match[1], 10);
        if (stdinBuffer.length < headerEnd + 4 + bodyLength) return false; // 正文未完整
        const body = stdinBuffer
          .slice(headerEnd + 4, headerEnd + 4 + bodyLength)
          .toString("utf-8");
        // 消费本条消息，多余字节保留给下一条
        stdinBuffer = stdinBuffer.slice(headerEnd + 4 + bodyLength);
        settled = true;
        resolve({ text: body, framing: "lsp" });
        return true;
      }

      // ── line framing（换行分隔 JSON，MCP 官方 stdio 标准） ──
      const lineEnd = stdinBuffer.indexOf("\n");
      if (lineEnd === -1) return false; // 行未完整
      const line = stdinBuffer.slice(0, lineEnd).toString("utf-8").trim();
      stdinBuffer = stdinBuffer.slice(lineEnd + 1);
      if (!line) return false; // 空行跳过，继续读下一条
      settled = true;
      resolve({ text: line, framing: "line" });
      return true;
    };

    // 上次调用残留的完整消息可直接解析
    if (tryParse()) return;

    const onData = (chunk) => {
      stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
      if (tryParse()) {
        process.stdin.removeListener("data", onData);
        process.stdin.removeListener("end", onEnd);
      }
    };
    const onEnd = () => {
      process.stdin.removeListener("data", onData);
      if (!settled) {
        settled = true;
        reject(new Error("stdin closed"));
      }
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", (err) => {
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

/** 向 stdout 写入一条响应消息（framing 跟随请求） */
function writeMessage(jsonObj, framing) {
  const text = JSON.stringify(jsonObj);
  const buf = Buffer.from(text, "utf-8");
  if (framing === "lsp") {
    process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n`);
    process.stdout.write(buf);
  } else {
    process.stdout.write(buf);
    process.stdout.write("\n");
  }
}

// ── 启动（stdio 模式） ────────────────────────────────

async function startStdio() {
  console.error(`[mcp-server] started v${SERVER_INFO.version}, dataDir: ${DATA_DIR}`);
  console.error(`[mcp-server] tools loaded: ${tools.length}, framing: line + lsp(auto)`);

  // 主循环：读取请求 → 处理 → 按请求 framing 写入响应
  while (true) {
    try {
      const { text, framing } = await readStdinMessage();
      if (!text || text.trim() === "") continue;

      let request;
      try {
        request = JSON.parse(text);
      } catch {
        console.error(`[mcp-server] invalid JSON: ${text.slice(0, 200)}`);
        continue;
      }

      const response = await handleRequest(request);
      if (response) {
        writeMessage(response, framing);
      }
    } catch (err) {
      // 流结束或异常，退出主循环
      console.error(`[mcp-server] stdin closed (${err.message})`);
      break;
    }
  }
}

// ── 启动（HTTP 模式，可选） ────────────────────────────

async function startHttp(port) {
  const { createServer } = await import("node:http");

  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf-8");

      let request;
      try {
        request = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const response = await handleRequest(request);
      if (response) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } else {
        res.writeHead(202);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    console.error(`[mcp-server] HTTP mode on http://127.0.0.1:${port}/mcp`);
    console.error(`[mcp-server] dataDir: ${DATA_DIR}`);
    console.error(`[mcp-server] tools loaded: ${tools.length}`);
  });
}

// ── 入口 ──────────────────────────────────────────────

const httpPort = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : null;
if (httpPort && !isNaN(httpPort)) {
  await startHttp(httpPort);
} else {
  await startStdio();
}
