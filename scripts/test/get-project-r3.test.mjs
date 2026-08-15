/**
 * neo-project-manage get_project R3 需求/方案清单渲染测试（node:test，真实临时库）
 *
 * 覆盖（T1 数据段合入前后均可跑）：
 * - 段落结构：任务 → 需求 → 方案 → 文件资产 → 备注 顺序正确
 * - 字段缺失容错：T1 合入前 data.getProject 无 requirements/plans 键，
 *   渲染按 0 处理输出「（无）」，不崩、无 undefined 脏输出
 * - view=summary：提前 return，不输出需求/方案段
 * - T1 合入后：真实创建需求/方案的断言自动生效（data.getProject 追加字段），
 *   届时补精确行格式断言即可（联调在 T1 完成后）
 *
 * 用法：node --test scripts/test/
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";
import { execute as getProject } from "../../tools/get-project.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r3-"));
const toolCtx = { dataDir: tmpDir, log: console };
const data = createDataAccess(tmpDir);

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

async function runGetProject(input) {
  const res = await getProject(input, toolCtx);
  assert.ok(res?.content?.[0]?.text, "get_project 应返回文本内容");
  return res.content[0].text;
}

// 输出中段落顺序辅助：各段头出现位置升序
function assertSectionOrder(text, heads) {
  const idxs = heads.map((h) => {
    const i = text.indexOf(h);
    assert.ok(i >= 0, `输出应含段头 ${h}`);
    return i;
  });
  for (let i = 1; i < idxs.length; i++) {
    assert.ok(idxs[i] > idxs[i - 1], `段顺序错：${heads[i - 1]} 应在 ${heads[i]} 之前`);
  }
}

test("R3 渲染：段落顺序 + 空字段容错（T1 合入前形态，不崩）", async () => {
  const proj = data.createProject({ name: "R3-渲染测试项目", members: ["测试员"], status: "进行中" });
  const task = data.createTask(proj.id, { name: "R3-任务" });

  const text = await runGetProject({ id: proj.id });

  // 段落顺序：任务 → 需求 → 方案 → 文件资产 → 备注
  assertSectionOrder(text, ["--- 任务 (1) ---", "--- 需求 (0) ---", "--- 方案 (0) ---", "--- 文件资产 (0) ---", "--- 备注 (0) ---"]);

  // 需求/方案段空时输出（无），无 undefined 脏输出
  const reqSection = text.slice(text.indexOf("--- 需求"), text.indexOf("--- 方案"));
  assert.ok(reqSection.includes("  （无）"), "需求段应输出（无）");
  const planSection = text.slice(text.indexOf("--- 方案"), text.indexOf("--- 文件资产"));
  assert.ok(planSection.includes("  （无）"), "方案段应输出（无）");
  assert.ok(!text.includes("undefined"), "输出不应含 undefined");

  // 常规段不受影响
  assert.match(text, /R3-渲染测试项目/);
  assert.match(text, /R3-任务/);

  // 清理
  data.deleteTask(proj.id, task.id);
  data.deleteProject(proj.id);
});

test("R3 渲染：view=summary 不输出需求/方案段（提前 return 不受影响）", async () => {
  const proj = data.createProject({ name: "R3-Summary项目" });
  data.createTask(proj.id, { name: "R3-Sum任务" });

  const text = await runGetProject({ id: proj.id, view: "summary" });

  assert.match(text, /--- 任务 \(1\) ---/, "summary 仍含任务段");
  assert.ok(!text.includes("--- 需求"), "summary 不应含需求段");
  assert.ok(!text.includes("--- 方案"), "summary 不应含方案段");
  assert.ok(!text.includes("--- 文件资产"), "summary 不应含文件资产段");
  assert.ok(!text.includes("--- 备注"), "summary 不应含备注段");

  data.deleteProject(proj.id);
});
