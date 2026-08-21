#!/usr/bin/env node
/**
 * neo-project-manage MCP Server
 *
 * 零外部依赖，直接实现 MCP 协议（JSON-RPC 2.0 over stdio with Content-Length framing）。
 * 数据默认指向当前用户的 Hana 正式版数据目录。
 *
 * 使用方式（在项目根目录下）：
 *   node mcp-server/index.js
 *
 * 环境变量：
 *   MCP_DATA_DIR   - 数据目录（默认 %USERPROFILE%/.hanako/plugin-data/neo-project-manage）
 *   MCP_PORT       - HTTP 模式端口（可选，不传则走 stdio 模式）
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");

// ── 配置 ──────────────────────────────────────────────
const DATA_DIR = process.env.MCP_DATA_DIR || path.join(
  process.env.USERPROFILE || process.env.HOME || "C:/Users/default",
  ".hanako/plugin-data/neo-project-manage"
);
const SERVER_INFO = {
  name: "neo-project-manage",
  version: "2.3.3",
};
const MCP_PROTOCOL_VERSION = "2025-03-26";

// ── 加载工具 ──────────────────────────────────────────
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

// ── Stdio 传输（Content-Length framing） ──────────────

/** 跨消息保留的 stdin 缓冲（同一 chunk 可能包含多条消息） */
let stdinBuffer = Buffer.alloc(0);

/** 从 stdin 读取一条消息 */
function readStdinMessage() {
  return new Promise((resolve, reject) => {
    let settled = false;

    // 尝试从缓冲中解析一条完整消息；成功则消费并 resolve
    const tryParse = () => {
      if (settled) return true;
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
      resolve(body);
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

/** 向 stdout 写入一条消息 */
function writeStdinMessage(jsonObj) {
  const text = JSON.stringify(jsonObj);
  const buf = Buffer.from(text, "utf-8");
  const header = `Content-Length: ${buf.length}\r\n\r\n`;
  process.stdout.write(header);
  process.stdout.write(buf);
}

// ── 启动（stdio 模式） ────────────────────────────────

async function startStdio() {
  // 通知客户端服务器就绪
  // 读取 MCP 版本 → 在日志中写明
  console.error(`[mcp-server] started, dataDir: ${DATA_DIR}`);
  console.error(`[mcp-server] tools loaded: ${tools.length}`);

  // 主循环：读取请求 → 处理 → 写入响应
  while (true) {
    try {
      const raw = await readStdinMessage();
      if (!raw || raw.trim() === "") continue;

      let request;
      try {
        request = JSON.parse(raw);
      } catch {
        console.error(`[mcp-server] invalid JSON: ${raw.slice(0, 200)}`);
        continue;
      }

      const response = await handleRequest(request);
      if (response) {
        writeStdinMessage(response);
      }
    } catch (err) {
      // 流结束或异常
      if (err.code === "ERR_STREAM_PREMATURE_CLOSE" || err.message?.includes("read") === false) {
        break;
      }
      console.error(`[mcp-server] read error: ${err.message}`);
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