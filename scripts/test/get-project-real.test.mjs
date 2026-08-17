/**
 * neo-project-manage get_project 真实数据联调测试（node:test）
 *
 * 背景：get-project-r3.test.mjs 顶部用 mock.module 替换 lib/data.js（fake 数据，
 * 保证渲染用例不依赖 T1 数据段合入）；真实数据联调（T1 data.getProject 字段
 * → T2 get_project 工具渲染）无法在同一进程复用，故独立成文件。
 *
 * 覆盖（B 遗留联调断言）：
 * - 真实库建需求/方案（含关联方案、评论、转任务）→ 调 get_project 工具 → 断言行格式
 * - 段落顺序：任务 → 需求 → 方案 → 文件资产 → 备注
 * - 空需求/方案输出（无）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const { execute } = await import("../../tools/get-project.js");

test("联调：真实库建需求/方案 → get_project 工具行格式断言", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r3real-"));
  const data = createDataAccess(dir);
  const ctx = { dataDir: dir };
  try {
    const p = data.createProject({ name: "联调项目", status: "进行中" });
    // 任务
    data.createTask(p.id, { name: "联调任务" });
    // 需求 ×2：一个关联方案，一个无
    const r1 = data.createRequirement(p.id, { name: "联调需求一", priority: "P0" });
    const r2 = data.createRequirement(p.id, { name: "联调需求二", priority: "P3" });
    // 方案 ×2：方案一 已采纳 + 评论 + 转任务；方案二 纯草稿
    const plan1 = data.createPlan(p.id, "联调方案甲", "<p>方案内容</p>");
    data.addPlanComment(p.id, plan1.id, "联调评论");
    data.updatePlan(p.id, plan1.id, { status: "已采纳" });
    data.convertPlanToTask(p.id, plan1.id);
    data.createPlan(p.id, "联调方案乙");
    data.linkRequirementPlans(p.id, r1.id, [plan1.id]);

    const res = await execute({ id: p.id }, ctx);
    const text = res.content[0].text;

    // 段头 + 计数
    assert.match(text, /--- 需求 \(2\) ---/);
    assert.match(text, /--- 方案 \(2\) ---/);

    // 需求行：图标/名称/P/状态/关联方案/ID
    assert.ok(text.includes("  ⬜ 联调需求一 [P0] [待处理] [关联方案 1] [ID: "), "待处理需求行格式");
    assert.ok(text.includes("  ⬜ 联调需求二 [P3] [待处理] [ID: "), "无关联方案不输出关联标记");

    // 方案行：标题/状态/评论/转任务/ID（convertPlanToTask 转出的任务名=方案标题）
    assert.ok(text.includes("  联调方案甲 [已采纳] [评论 1] [转任务: 联调方案甲] [ID: "), "已采纳+评论+转任务齐全");
    assert.ok(text.includes("  联调方案乙 [草稿] [ID: "), "纯草稿不输出评论/转任务标记");

    // 段落顺序（任务数 2：联调任务 + 方案甲转出的任务）
    const idx = (s) => text.indexOf(s);
    assert.ok(idx("--- 任务 (2) ---") < idx("--- 需求 (2) ---"), "需求段在任务树之后");
    assert.ok(idx("--- 需求 (2) ---") < idx("--- 方案 (2) ---"), "方案段在需求段之后");
    assert.ok(idx("--- 方案 (2) ---") < idx("--- 文件资产 (0) ---"), "方案段在文件资产之前");
    assert.ok(idx("--- 文件资产 (0) ---") < idx("--- 备注 (0) ---"), "文件资产段在备注之前");

    // 项目头 + 常规段不受影响
    assert.match(text, /联调项目/);
    assert.match(text, /联调任务/);
  } finally {
    try { data._db.close(); } catch { /* ignore */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test("联调：无需求/方案的真实库输出（无），不崩", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r3real2-"));
  const data = createDataAccess(dir);
  const ctx = { dataDir: dir };
  try {
    const p = data.createProject({ name: "空清单项目" });
    const res = await execute({ id: p.id }, ctx);
    const text = res.content[0].text;
    assert.match(text, /--- 需求 \(0\) ---/);
    assert.match(text, /--- 方案 \(0\) ---/);
    // 精确匹配：需求/方案两段各紧跟一个（无）（任务/文件/备注段也有（无），不能全局计数）
    assert.ok(text.includes("--- 需求 (0) ---\n  （无）"), "需求段输出（无）");
    assert.ok(text.includes("--- 方案 (0) ---\n  （无）"), "方案段输出（无）");
    assert.ok(!text.includes("undefined"), "输出不应含 undefined");
  } finally {
    try { data._db.close(); } catch { /* ignore */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
