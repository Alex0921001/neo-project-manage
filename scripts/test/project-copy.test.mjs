/**
 * 复制项目回归测试（node:test）
 *
 * 覆盖：按选项复制、状态重置、层级保持、名称与日期校验、源项目不存在
 * 用法：NVM_SKIP_VENDOR=1 node --test scripts/test/project-copy.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-copy-"));
let data;
let src;

before(() => {
  data = createDataAccess(tmpDir);
  src = data.createProject({
    name: "源项目",
    description: "源描述",
    planStart: "2026-08-01",
    planEnd: "2026-08-31",
    status: "进行中",
    members: ["张三"],
  });
  const t1 = data.createTask(src.id, {
    name: "顶层任务",
    priority: "P0",
    assignees: ["张三"],
    startDate: "2026-08-02",
    endDate: "2026-08-05",
  });
  data.createTask(src.id, { name: "子任务", parentTaskId: t1.id });
  data.createRequirement(src.id, { name: "需求一", priority: "P1" });
  data.createPlan(src.id, "方案一", "<p>内容</p>");
  const card = data.createVerification(src.id, { name: "验证卡", note: "验证备注" });
  data.createVerificationItem(src.id, card.id, { content: "验证项一" });
  data.createNote(src.id, { content: "项目备注一" });
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test("复制：全选时各类内容数量与源项目一致", () => {
  const r = data.copyProject(src.id, {
    name: "副本项目",
    description: "源描述",
    planStart: "2026-08-01",
    planEnd: "2026-08-31",
    status: "待开始",
    members: ["张三"],
    copy: { tasks: true, requirements: true, plans: true, verifications: true, files: true, notes: true },
  });
  assert.equal(r.project.name, "副本项目");
  assert.equal(r.project.id === src.id, false, "新项目 ID 必须与源项目不同");
  assert.equal(r.copied.tasks, 2);
  assert.equal(r.copied.requirements, 1);
  assert.equal(r.copied.plans, 1);
  assert.equal(r.copied.verifications, 1);
  assert.equal(r.copied.notes, 1);
  assert.deepEqual(r.skippedFiles, []);
});

test("复制：未勾选的内容不复制", () => {
  const r = data.copyProject(src.id, {
    name: "空副本",
    copy: { tasks: false, requirements: false, plans: false, verifications: false, files: false, notes: false },
  });
  assert.equal(r.copied.tasks, 0);
  assert.equal(r.copied.annotations, 0);
  assert.equal(r.copied.requirements, 0);
  assert.equal(r.copied.plans, 0);
  assert.equal(r.copied.verifications, 0);
  assert.equal(r.copied.files, 0);
  assert.equal(r.copied.notes, 0);
});

test("复制：任务层级保持，完成状态重置", () => {
  const r = data.copyProject(src.id, { name: "层级副本", copy: { tasks: true } });
  const full = data.getProject(r.project.id);
  assert.equal(full.tasks.length, 1, "顶层任务只有一个");
  assert.equal(full.tasks[0].subtasks.length, 1, "子任务挂在顶层任务下");
  assert.equal(!!full.tasks[0].done, false, "顶层任务完成状态重置");
  assert.equal(!!full.tasks[0].subtasks[0].done, false, "子任务完成状态重置");
  assert.equal(full.tasks[0].priority, "P0", "优先级保留");
});

test("复制：需求状态重置为待处理，优先级保留", () => {
  const r = data.copyProject(src.id, { name: "需求副本", copy: { requirements: true } });
  const reqs = data.listRequirements(r.project.id);
  const list = reqs.items || [];
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "待处理");
  assert.equal(list[0].priority, "P1");
});

test("复制：方案状态重置为草稿", () => {
  const r = data.copyProject(src.id, { name: "方案副本", copy: { plans: true } });
  const plans = data.listPlans(r.project.id);
  const list = plans.items || [];
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "草稿");
});

test("复制：验证卡连验证项一起复制", () => {
  const r = data.copyProject(src.id, { name: "验证副本", copy: { verifications: true } });
  const cards = data.listVerifications(r.project.id);
  const list = cards.items || [];
  assert.equal(list.length, 1);
  assert.equal(list[0].progress?.total, 1, "验证项随卡一起复制");
  assert.equal(list[0].progress?.done, 0, "勾选状态已重置");
});

test("校验：名称为空、超长、状态非法、日期倒置、源项目不存在", () => {
  assert.throws(() => data.copyProject(src.id, { name: "   " }), /不能为空/);
  assert.throws(
    () => data.copyProject(src.id, { name: "一二三四五六七八九十一二三四五六七八九十X" }),
    /20/
  );
  assert.throws(() => data.copyProject(src.id, { name: "X", status: "乱写" }), /状态/);
  assert.throws(
    () => data.copyProject(src.id, { name: "X", planStart: "2026-08-10", planEnd: "2026-08-01" }),
    /结束|早于/
  );
  assert.throws(() => data.copyProject("不存在项目", { name: "X" }), /不存在/);
});
