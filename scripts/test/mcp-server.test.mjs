/**
 * MCP Server 集成测试（V2.6.2，子进程 + 临时数据目录，不触碰真实数据）
 * 覆盖：line framing（MCP 官方 stdio 标准）/ Content-Length framing 兼容 / 工具动态加载 / 版本号来自 manifest / tools/call 链路
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "..", "mcp-server", "index.js");
const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "manifest.json"), "utf-8"));

const tmpDirs = [];
const children = [];

function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-mcp-test-"));
  tmpDirs.push(dataDir);
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, NVM_SKIP_VENDOR: "1", MCP_DATA_DIR: dataDir },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child);
  return child;
}

/** line framing：发送一条请求并读取一行 JSON 响应 */
function callLine(child, request, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => { cleanup(); reject(new Error(`read timeout: ${request.method}`)); }, timeoutMs);
    const onData = (chunk) => {
      buf += chunk.toString("utf-8");
      const idx = buf.indexOf("\n");
      if (idx === -1) return;
      const line = buf.slice(0, idx).trim();
      if (!line) return;
      cleanup();
      try { resolve(JSON.parse(line)); }
      catch (e) { reject(new Error(`bad json: ${line.slice(0, 120)}`)); }
    };
    const cleanup = () => { clearTimeout(timer); child.stdout.removeListener("data", onData); };
    child.stdout.on("data", onData);
    child.stdin.write(JSON.stringify(request) + "\n");
  });
}

/** CL framing：发送 Content-Length 消息并读取完整 LSP 响应 */
function callLsp(child, request, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(request);
    const bufBody = Buffer.from(body, "utf-8");
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => { cleanup(); reject(new Error(`read timeout: ${request.method}`)); }, timeoutMs);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const m = buf.slice(0, headerEnd).toString("utf-8").match(/Content-Length:\s*(\d+)/i);
      if (!m) return;
      const len = parseInt(m[1], 10);
      if (buf.length < headerEnd + 4 + len) return;
      cleanup();
      try { resolve(JSON.parse(buf.slice(headerEnd + 4, headerEnd + 4 + len).toString("utf-8"))); }
      catch (e) { reject(new Error(`bad json: ${e.message}`)); }
    };
    const cleanup = () => { clearTimeout(timer); child.stdout.removeListener("data", onData); };
    child.stdout.on("data", onData);
    child.stdin.write(`Content-Length: ${bufBody.length}\r\n\r\n`);
    child.stdin.write(bufBody);
  });
}

let lineChild, lspChild;

before(() => {
  lineChild = startServer();
  lspChild = startServer();
});

after(() => {
  for (const c of children) { try { c.kill(); } catch { /* ignore */ } }
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
});

test("MCP line framing（官方 stdio 标准）：initialize / tools/list / tools/call 全链路", async () => {
  // 1. initialize：版本号来自 manifest.json
  const init = await callLine(lineChild, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
  });
  assert.equal(init.result.serverInfo.version, MANIFEST.version);
  assert.equal(init.result.serverInfo.name, MANIFEST.id);
  assert.equal(init.result.protocolVersion, "2025-03-26");

  // 2. tools/list：动态扫描 tools/，数量与 manifest 注册一致，且包含 V2.6.2 批量工具
  const list = await callLine(lineChild, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = list.result.tools.map((t) => t.name);
  assert.equal(names.length, MANIFEST.contributes.tools.length);
  for (const t of ["create_requirements", "toggle_verification_items", "add_comments", "create_quick_tasks", "delete_plans"]) {
    assert.ok(names.includes(t), `tools/list 应包含 ${t}`);
  }
  // 每个工具都有 inputSchema
  assert.ok(list.result.tools.every((t) => t.inputSchema && t.inputSchema.type === "object"));

  // 3. tools/call：真实工具链路（临时库，安全）
  const call = await callLine(lineChild, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_project_sets", arguments: {} } });
  assert.ok(call.result, "tools/call 应返回 result");
  assert.ok(Array.isArray(call.result.content));

  // 4. 未知工具 → JSON-RPC 错误
  const unknown = await callLine(lineChild, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "no_such_tool", arguments: {} } });
  assert.equal(unknown.error.code, -32602);

  // 5. 空行容错：空行后请求仍正常响应
  lineChild.stdin.write("\n");
  const afterBlank = await callLine(lineChild, { jsonrpc: "2.0", id: 5, method: "tools/list", params: {} });
  assert.equal(afterBlank.result.tools.length, names.length);
});

test("MCP Content-Length framing：兼容既有客户端，响应跟随 LSP 格式", async () => {
  const init = await callLsp(lspChild, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "legacy", version: "1.0" } },
  });
  assert.equal(init.result.serverInfo.version, MANIFEST.version);

  const list = await callLsp(lspChild, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(list.result.tools.length, MANIFEST.contributes.tools.length);
});
