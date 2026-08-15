/**
 * neo-project-manage V2.2 R14 任务↔方案双向关联测试（node:test）
 *
 * 覆盖：
 * 1. createTask planIds 写 task_plans，getTaskById / getProject 树返回 planRefs
 * 2. planIds 白名单校验（跨项目 / 不存在抛错）
 * 3. updateTask planIds 全量替换
 * 4. createPlan taskIds / updatePlan taskIds 全量替换，getPlan 返回 taskRefs
 * 5. convertPlanToTask 同步写 task_plans 双向关联
 * 6. deleteTask 清 task_plans 无残留
 * 7. deletePlan 清 task_plans 无残留
 * 8. 启动自愈清理悬空 task_plans
 *
 * 用法：node --test scripts/test/r14-task-plan.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r14-"));
let data;

before(() => {
  data = createDataAccess(tmpDir);
});
after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function expectThrow(fn, pattern) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof Error, "应抛 Error");
    if (pattern) assert.match(String(err.message), pattern, `错误信息应匹配 ${pattern}，实际: ${err.message}`);
    return true;
  });
}

// ===== 1. createTask planIds 双向挂载 + 双侧读回 =====
test("R14-1：createTask planIds 写 task_plans，getTaskById / getProject / getPlan 双侧读回", () => {
  const proj = data.createProject({ name: "R14-项目" });
  const plan = data.createPlan(proj.id, "关联方案", "<p>x</p>");
  data.updatePlan(proj.id, plan.id, { status: "已采纳" }); // 任务只能关联已采纳的方案
  const task = data.createTask(proj.id, { name: "关联任务", planIds: [plan.id] });

  // 任务侧 planRefs（含方案标题）
  const got = data.getTaskById(task.id);
  assert.equal(got.planRefs.length, 1, "getTaskById 应返回 planRefs");
  assert.equal(got.planRefs[0].id, plan.id);
  assert.equal(got.planRefs[0].title, "关联方案");

  // 项目树侧 planRefs（前端任务列表数据源）
  const full = data.getProject(proj.id);
  const treeTask = full.tasks.find((t) => t.id === task.id);
  assert.equal(treeTask.planRefs.length, 1, "getProject 树任务应挂 planRefs");
  assert.equal(treeTask.planRefs[0].title, "关联方案");

  // 方案侧 taskRefs（含任务名）
  const p = data.getPlan(proj.id, plan.id);
  assert.equal(p.taskRefs.length, 1, "getPlan 应返回 taskRefs");
  assert.equal(p.taskRefs[0].id, task.id);
  assert.equal(p.taskRefs[0].name, "关联任务");
});

// ===== 2. planIds / taskIds 白名单校验（跨项目 / 不存在抛错，无幽灵残留） =====
test("R14-2：planIds/taskIds 白名单校验（跨项目 / 不存在抛错，无幽灵残留）", () => {
  const proj = data.createProject({ name: "R14-校验项目" });
  const other = data.createProject({ name: "R14-其他项目" });
  const plan = data.createPlan(other.id, "外部方案", "<p>x</p>");
  expectThrow(() => data.createTask(proj.id, { name: "X", planIds: [plan.id] }), /不存在/);
  expectThrow(() => data.createTask(proj.id, { name: "X", planIds: ["deadbeef"] }), /不存在/);

  // createPlan 关联校验前置：taskIds 非法抛错后，plans 表不应残留该方案（无幽灵方案）
  const before = data._db.prepare("SELECT COUNT(*) c FROM plans WHERE project_id = ?").get(proj.id).c;
  expectThrow(() => data.createPlan(proj.id, "幽灵方案", "", [], ["deadbeef"]), /不存在/);
  const after = data._db.prepare("SELECT COUNT(*) c FROM plans WHERE project_id = ?").get(proj.id).c;
  assert.equal(after, before, "createPlan taskIds 校验失败不应残留方案行");

  // requirementIds 跨项目（外部需求）也不残留
  const reqOther = data.createRequirement(other.id, { name: "外部需求" });
  expectThrow(() => data.createPlan(proj.id, "幽灵方案2", "", [reqOther.id], []), /不存在/);
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM plans WHERE project_id = ?").get(proj.id).c, before, "createPlan requirementIds 校验失败也不残留方案行");
});

// ===== 3. updateTask planIds 全量替换 =====
test("R14-3：updateTask planIds 全量替换", () => {
  const proj = data.createProject({ name: "R14-更新项目" });
  const p1 = data.createPlan(proj.id, "方案1", "");
  const p2 = data.createPlan(proj.id, "方案2", "");
  data.updatePlan(proj.id, p1.id, { status: "已采纳" });
  data.updatePlan(proj.id, p2.id, { status: "已采纳" });
  const task = data.createTask(proj.id, { name: "任务", planIds: [p1.id] });

  data.updateTask(proj.id, task.id, { planIds: [p2.id] });
  assert.deepEqual(data.getTaskById(task.id).planRefs.map((p) => p.id), [p2.id]);

  data.updateTask(proj.id, task.id, { planIds: [] });
  assert.deepEqual(data.getTaskById(task.id).planRefs, [], "空数组应清空关联");
});

// ===== 4. createPlan taskIds + updatePlan taskIds 全量替换 =====
test("R14-4：createPlan taskIds / updatePlan taskIds 全量替换", () => {
  const proj = data.createProject({ name: "R14-方案侧项目" });
  const t1 = data.createTask(proj.id, { name: "任务1" });
  const t2 = data.createTask(proj.id, { name: "任务2" });
  const plan = data.createPlan(proj.id, "方案", "", [], [t1.id]);
  assert.deepEqual(data.getPlan(proj.id, plan.id).taskRefs.map((t) => t.id), [t1.id]);

  data.updatePlan(proj.id, plan.id, { taskIds: [t2.id] });
  assert.deepEqual(data.getPlan(proj.id, plan.id).taskRefs.map((t) => t.id), [t2.id]);

  data.updatePlan(proj.id, plan.id, { taskIds: [] });
  assert.deepEqual(data.getPlan(proj.id, plan.id).taskRefs, [], "空数组应清空任务关联");
});

// ===== 5. convertPlanToTask 同步写 task_plans（三步事务原子） =====
test("R14-5：convertPlanToTask 同步写 task_plans 双向关联（tasks/task_plans/plans.task_id 三者一致）", () => {
  const proj = data.createProject({ name: "R14-转任务项目" });
  const plan = data.createPlan(proj.id, "可转方案", "<p>x</p>");
  data.updatePlan(proj.id, plan.id, { status: "已采纳" });
  const conv = data.convertPlanToTask(proj.id, plan.id);

  // 任务侧反向关联方案
  const got = data.getTaskById(conv.taskId);
  assert.equal(got.planRefs.length, 1, "转出的任务应反向关联方案");
  assert.equal(got.planRefs[0].id, plan.id);

  // 三步原子一致性：task_plans 有记录 + plans.task_id 指向任务 + tasks 行存在
  const tpCnt = data._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE task_id = ? AND plan_id = ?").get(conv.taskId, plan.id).c;
  assert.equal(tpCnt, 1, "task_plans 应有一条双向关联记录");
  const planTaskId = data._db.prepare("SELECT task_id FROM plans WHERE id = ?").get(plan.id).task_id;
  assert.equal(planTaskId, conv.taskId, "plans.task_id 应指向转出的任务");
  const taskExists = data._db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(conv.taskId);
  assert.ok(taskExists, "tasks 表应存在转出的任务行");
});

// ===== 6. deleteTask 清 task_plans 无残留 =====
test("R14-6：deleteTask 清 task_plans 无残留", () => {
  const proj = data.createProject({ name: "R14-删任务项目" });
  const plan = data.createPlan(proj.id, "方案", "");
  data.updatePlan(proj.id, plan.id, { status: "已采纳" });
  const task = data.createTask(proj.id, { name: "任务", planIds: [plan.id] });
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE task_id = ?").get(task.id).c, 1);

  data.deleteTask(proj.id, task.id);
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE task_id = ?").get(task.id).c, 0, "删任务后 task_plans 应无残留");
});

// ===== 7. deletePlan 清 task_plans 无残留 =====
test("R14-7：deletePlan 清 task_plans 无残留", () => {
  const proj = data.createProject({ name: "R14-删方案项目" });
  const task = data.createTask(proj.id, { name: "任务" });
  const plan = data.createPlan(proj.id, "方案", "", [], [task.id]);
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE plan_id = ?").get(plan.id).c, 1);

  data.deletePlan(proj.id, plan.id);
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE plan_id = ?").get(plan.id).c, 0, "删方案后 task_plans 应无残留");
});

// ===== 8. 启动自愈清理悬空 task_plans =====
test("R14-8：启动自愈清理悬空 task_plans 关联", () => {
  const proj = data.createProject({ name: "R14-自愈项目" });
  const plan = data.createPlan(proj.id, "方案", "");
  // 制造悬空：临时关外键约束插入（FK 约束生效时正常无法产生悬空，此处仅验证自愈兑底）
  data._db.pragma("foreign_keys = OFF");
  data._db.prepare("INSERT INTO task_plans (task_id, plan_id) VALUES (?, ?)").run("deadbeef", plan.id);
  data._db.pragma("foreign_keys = ON");
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE plan_id = ?").get(plan.id).c, 1);

  const data2 = createDataAccess(tmpDir);
  const cnt = data2._db.prepare("SELECT COUNT(*) c FROM task_plans WHERE task_id = ? AND plan_id = ?").get("deadbeef", plan.id).c;
  assert.equal(cnt, 0, "自愈应清理悬空 task_plans 关联");
});
