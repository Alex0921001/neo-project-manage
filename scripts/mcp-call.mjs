#!/usr/bin/env node
/**
 * Local MCP bridge helper.
 *
 * Usage:
 *   node scripts/mcp-call.mjs list_projects '{}'
 *   node scripts/mcp-call.mjs get_project '{"id":"..."}'
 *
 * This intentionally talks to the existing mcp-server/index.js instead of
 * duplicating tool implementations. It is a one-shot adapter for environments
 * where the host can execute commands but cannot register an MCP server as a
 * first-class tool.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "mcp-server", "index.js");

const toolName = process.argv[2];
const rawArgs = process.argv[3] ?? "{}";

if (!toolName) {
  console.error("Usage: node scripts/mcp-call.mjs <toolName> [jsonArgs]");
  process.exit(2);
}

let args;
try {
  args = JSON.parse(rawArgs);
} catch (err) {
  console.error(`Invalid JSON arguments: ${err.message}`);
  process.exit(2);
}

const child = spawn(process.execPath, [SERVER], {
  cwd: ROOT,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

let stdout = "";
let stderr = "";
let buffer = "";
let settled = false;

function fail(message, code = 1) {
  if (settled) return;
  settled = true;
  child.kill();
  console.error(message);
  if (stderr.trim()) console.error(stderr.trim());
  process.exit(code);
}

function send(request) {
  child.stdin.write(`${JSON.stringify(request)}\n`);
}

function consumeLine(line) {
  const text = line.trim();
  if (!text) return;

  let response;
  try {
    response = JSON.parse(text);
  } catch {
    return;
  }

  if (response.id === 1) {
    send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
    return;
  }

  if (response.id === 2) {
    settled = true;
    child.kill();
    process.stdout.write(`${JSON.stringify(response.result ?? response.error)}\n`);
    process.exit(response.error ? 1 : 0);
  }
}

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", chunk => {
  stdout += chunk;
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) consumeLine(line);
});

child.stderr.on("data", chunk => {
  stderr += chunk;
});

child.on("error", err => fail(`Failed to start MCP server: ${err.message}`));

child.on("exit", (code, signal) => {
  if (!settled) {
    fail(`MCP server exited before returning the tool result (code=${code}, signal=${signal})`);
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {},
});

setTimeout(() => {
  if (!settled) fail("MCP tool call timed out after 30 seconds");
}, 30000).unref();
