/**
 * neo-project-manage V2.3 R3 数据层测试（node:test）
 *
 * 覆盖：getProject 新增 requirements/plans 字段（存在且字段名/值齐全——接口约定给 T2 get-project 渲染）、
 * 空项目返回空数组、summarizeProject 不受影响。每个 test 独立临时库，跑完自动清理。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

function newData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r3-"));
  const data = createDataAccess(dir);
  return {
    data,
    close: () => {
      try { data._db.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

test("getProject 新字段：requirements/plans 存在且字段齐全（T2 渲染契约）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "R3 契约项目", status: "进行中" });

    // 需求 ×2（带关联方案 + 无关联方案）
    const r1 = data.createRequirement(p.id, { name: "需求契约一", priority: "P0" });
    const r2 = data.createRequirement(p.id, { name: "需求契约二", priority: "P3" });
    // 方案 ×2（带评论/转任务 + 纯草稿）
    const plan1 = data.createPlan(p.id, "方案契约一", "<p>内容</p>");
    data.createPlan(p.id, "方案契约二");
    data.addPlanComment(p.id, plan1.id, "评论一");
    data.updatePlan(p.id, plan1.id, { status: "已采纳" });
    const conv = data.convertPlanToTask(p.id, plan1.id); // plan1 转任务 → taskName 非空
    data.linkRequirementPlans(p.id, r1.id, [plan1.id]); // r1.planCount = 1

    const got = data.getProject(p.id);
    // requirements 契约：id/name/status/priority/planCount
    assert.ok(Array.isArray(got.requirements), "requirements 为数组");
    assert.equal(got.requirements.length, 2);
    const reqMap = Object.fromEntries(got.requirements.map((r) => [r.name, r]));
    assert.deepEqual(Object.keys(reqMap["需求契约一"]).sort(), ["id", "name", "planCount", "priority", "status"], "字段名完全一致");
    assert.equal(reqMap["需求契约一"].status, "待处理");
    assert.equal(reqMap["需求契约一"].priority, "P0");
    assert.equal(reqMap["需求契约一"].planCount, 1, "关联方案数");
    assert.equal(reqMap["需求契约二"].planCount, 0);

    // plans 契约：id/title/status/commentCount/taskName
    assert.equal(got.plans.length, 2);
    const planMap = Object.fromEntries(got.plans.map((pl) => [pl.title, pl]));
    assert.deepEqual(Object.keys(planMap["方案契约一"]).sort(), ["commentCount", "id", "status", "taskName", "title"], "字段名完全一致");
    assert.equal(planMap["方案契约一"].status, "已采纳");
    assert.equal(planMap["方案契约一"].commentCount, 1);
    assert.equal(planMap["方案契约一"].taskName, conv.taskName, "转任务后 taskName 非空");
    assert.equal(planMap["方案契约二"].commentCount, 0);
    assert.equal(planMap["方案契约二"].taskName, null);
  } finally {
    close();
  }
});

test("getProject 新字段：空项目返回空数组（不是 null）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "空项目" });
    const got = data.getProject(p.id);
    assert.ok(Array.isArray(got.requirements) && got.requirements.length === 0, "空项目 requirements=[]");
    assert.ok(Array.isArray(got.plans) && got.plans.length === 0, "空项目 plans=[]");
  } finally {
    close();
  }
});

test("summarizeProject 不受 R3 字段影响", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "总结不受影响", status: "进行中" });
    data.createTask(p.id, { name: "任务甲" });
    data.createTask(p.id, { name: "任务乙", done: true });
    data.createPlan(p.id, "一个方案");
    data.createRequirement(p.id, { name: "一个需求" });

    const s = data.summarizeProject(p.id);
    assert.equal(typeof s.summary, "string");
    assert.ok(Array.isArray(s.risks));
    assert.equal(s.project.name, "总结不受影响");
    assert.equal(typeof s.project.progress, "number");
    assert.equal(s.stats.total, 2, "任务统计不受影响");

    // generateReport 也不受影响（内部调用 getProject）
    const report = data.generateReport(p.id, { range: "last7days" });
    assert.match(report.markdown, /总结不受影响/);
  } finally {
    close();
  }
});
