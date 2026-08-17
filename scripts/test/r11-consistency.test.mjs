/**
 * neo-project-manage V2.2 R11 工具层查询/描述一致性回归测试（node:test）
 *
 * 覆盖：
 * 1. getRequirement / getPlan 全局查询（projectId 可选）+ 归属校验
 * 2. 列表工具输出完整 ID + get 工具短 ID 前缀匹配（唯一命中 / 多候选）
 * 3. update_task 工具描述含便利贴前置校验 + 父任务冻结说明
 * 4. deleteTask 清 plans.task_id（方案可再次转任务）/ deletePlan 清 requirement_plans / 启动自愈清悬空引用
 *
 * 用法：node --test scripts/test/r11-consistency.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r11-"));
let data;
const toolCtx = { dataDir: tmpDir, log: console };

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

/** 直接插入指定 ID 的需求（绕过随机 shortId，构造前缀冲突场景） */
function seedRequirement(id, name, projectId) {
  data._db.prepare(
    "INSERT INTO requirements (id, project_id, name, description, status, priority, created_at) VALUES (?,?,?,'','待处理','P3',?)"
  ).run(id, projectId, name, new Date().toISOString());
}

/** 直接插入指定 ID 的方案 */
function seedPlan(id, title, projectId) {
  data._db.prepare(
    "INSERT INTO plans (id, project_id, title, content, status, task_id, created_at, updated_at) VALUES (?,?,?,'','草稿',NULL,?,?)"
  ).run(id, projectId, title, new Date().toISOString(), new Date().toISOString());
}

// ===== 1. 需求 / 方案全局查询 + 归属校验 =====
test("R11-1：getRequirement / getPlan 全局查询（projectId 可选）+ 归属校验", () => {
  const projA = data.createProject({ name: "R11-项目A" });
  const projB = data.createProject({ name: "R11-项目B" });
  const req = data.createRequirement(projA.id, { name: "全局需求" });
  const plan = data.createPlan(projA.id, "全局方案", "<p>x</p>");

  // 仅凭完整 ID 全局查询
  assert.equal(data.getRequirement(null, req.id).name, "全局需求");
  assert.equal(data.getPlan(null, plan.id).title, "全局方案");

  // 传正确 projectId 命中
  assert.equal(data.getRequirement(projA.id, req.id).name, "全局需求");
  assert.equal(data.getPlan(projA.id, plan.id).title, "全局方案");

  // 传错误 projectId 校验归属失败
  expectThrow(() => data.getRequirement(projB.id, req.id), /不存在/);
  expectThrow(() => data.getPlan(projB.id, plan.id), /不存在/);

  // 不存在的完整 ID 报错
  expectThrow(() => data.getRequirement(null, "ffffffff"), /不存在/);
  expectThrow(() => data.getPlan(null, "ffffffff"), /不存在/);

  // 空 ID 报错
  expectThrow(() => data.getRequirement(null, "  "), /不能为空/);
  expectThrow(() => data.getPlan(null, ""), /不能为空/);
});

// ===== 2. 短 ID 前缀匹配：唯一命中 / 多候选 =====
test("R11-2：get 工具短 ID 前缀匹配（唯一命中 / 多候选）", () => {
  const proj = data.createProject({ name: "R11-前缀项目" });
  seedRequirement("abc12345", "前缀需求甲", proj.id);
  seedRequirement("abcd6789", "前缀需求乙", proj.id);
  seedPlan("abc12345", "前缀方案甲", proj.id);
  seedPlan("abcd6789", "前缀方案乙", proj.id);

  // 唯一前缀命中（abcd 只命中 abcd6789）
  assert.equal(data.getRequirement(null, "abcd").id, "abcd6789");
  assert.equal(data.getPlan(null, "abcd").id, "abcd6789");

  // 精确命中优先于前缀
  assert.equal(data.getRequirement(null, "abc12345").id, "abc12345");
  assert.equal(data.getPlan(null, "abc12345").id, "abc12345");

  // 多候选前缀抛错并列出候选
  expectThrow(() => data.getRequirement(null, "abc"), /匹配到 2 个需求/);
  expectThrow(() => data.getPlan(null, "abc"), /匹配到 2 个方案/);
  expectThrow(() => data.getRequirement(null, "abc"), /abc12345/);
  expectThrow(() => data.getPlan(null, "abc"), /abcd6789/);
});

// ===== 2b. 短前缀含 SQL 通配符（% _ \）按字面匹配，不误配/漏配 =====
test("R11-2b：get 短前缀含 SQL 通配符按字面匹配", () => {
  const proj = data.createProject({ name: "R11-通配项目" });
  // 每个通配符配一个「占位」id：若未转义会被 LIKE 误匹配
  seedRequirement("w_c123", "下划线需求", proj.id);
  seedRequirement("wXc456", "下划线占位需求", proj.id);
  seedRequirement("w%c789", "百分号需求", proj.id);
  seedRequirement("wZZc999", "百分号占位需求", proj.id);
  seedRequirement("w\\c321", "反斜杠需求", proj.id);
  seedRequirement("wc765", "反斜杠占位需求", proj.id);

  assert.equal(data.getRequirement(null, "w_c").id, "w_c123", "_ 应按字面匹配而非通配");
  assert.equal(data.getRequirement(null, "w%c").id, "w%c789", "% 应按字面匹配而非通配");
  assert.equal(data.getRequirement(null, "w\\c").id, "w\\c321", "\\ 应按字面匹配而非转义语义");
});

// ===== 2c. 短前缀命中后关联数据按解析后的完整 ID 查询 =====
test("R11-2c：短前缀命中后关联数据（plans/planIds/评论）按完整 ID 查询", () => {
  const proj = data.createProject({ name: "R11-前缀关联项目" });
  seedRequirement("reqp0001", "关联需求乙", proj.id);
  seedPlan("planp0001", "关联方案乙", proj.id);
  data._db.prepare("INSERT INTO requirement_plans (requirement_id, plan_id) VALUES (?, ?)").run("reqp0001", "planp0001");
  data.addPlanComment(proj.id, "planp0001", "短前缀评论");

  const byReqPrefix = data.getRequirement(null, "reqp");
  assert.equal(byReqPrefix.id, "reqp0001");
  assert.deepEqual(byReqPrefix.planIds, ["planp0001"], "短前缀查询需求应返回完整关联 planIds");
  assert.equal(byReqPrefix.plans.length, 1, "短前缀查询需求应返回完整关联方案");

  const byPlanPrefix = data.getPlan(null, "planp");
  assert.equal(byPlanPrefix.id, "planp0001");
  assert.equal(byPlanPrefix.comments.length, 1, "短前缀查询方案应返回完整评论");
  assert.equal(byPlanPrefix.requirements.length, 1, "短前缀查询方案应返回完整关联需求");
});

// ===== 3. 列表工具输出完整 ID =====
test("R11-3：list_requirements / list_plans 输出完整 ID", async () => {
  const proj = data.createProject({ name: "R11-列表项目" });
  const req = data.createRequirement(proj.id, { name: "列表需求" });
  const plan = data.createPlan(proj.id, "列表方案", "<p>x</p>");

  const listReq = await import("../../tools/list-requirements.js");
  const reqText = (await listReq.execute({ projectId: proj.id }, toolCtx)).content[0].text;
  assert.ok(reqText.includes(req.id), `list_requirements 应输出完整 ID（${req.id}），实际: ${reqText}`);

  const listPlan = await import("../../tools/list-plans.js");
  const planText = (await listPlan.execute({ projectId: proj.id }, toolCtx)).content[0].text;
  assert.ok(planText.includes(plan.id), `list_plans 应输出完整 ID（${plan.id}），实际: ${planText}`);
});

// ===== 4. update_task 工具描述含前置校验说明 =====
test("R11-4：update_task 工具描述含便利贴前置校验 + 父任务冻结说明", async () => {
  const mod = await import("../../tools/update-task.js");
  assert.match(mod.description, /便利贴.*已确认/, "描述应说明完成任务前便利贴须全部确认");
  assert.match(mod.description, /父任务/, "描述应说明父任务冻结规则");
});

// ===== 5. deleteTask 清 task_id → 方案可再次转任务 =====
test("R11-5：deleteTask 清 plans.task_id，方案可再次转任务", () => {
  const proj = data.createProject({ name: "R11-删任务项目" });
  const plan = data.createPlan(proj.id, "可重转方案", "<p>x</p>");
  data.updatePlan(proj.id, plan.id, { status: "已采纳" });
  const conv = data.convertPlanToTask(proj.id, plan.id);

  data.deleteTask(proj.id, conv.taskId);

  const after = data.getPlan(proj.id, plan.id);
  assert.equal(after.taskId, null, "删除任务后方案 task_id 应置空");
  assert.equal(after.taskExists, null, "taskExists 回到未转状态（null）");

  // 可再次转任务
  const conv2 = data.convertPlanToTask(proj.id, plan.id);
  assert.ok(conv2.taskId && conv2.taskId !== conv.taskId, "方案应能再次转任务");
});

// ===== 5b. deleteTask 级联清理后代任务的方案关联（collectDescendantIds 分支）=====
test("R11-5b：deleteTask 级联清理后代任务的方案关联", () => {
  const proj = data.createProject({ name: "R11-删父任务项目" });
  const parent = data.createTask(proj.id, { name: "父任务" });
  const child = data.createTask(proj.id, { name: "子任务", parentTaskId: parent.id });
  const plan = data.createPlan(proj.id, "子任务关联方案", "<p>x</p>");
  // 模拟方案 task_id 指向子任务（convert 只建顶层任务，这里手工制造后代引用以覆盖 collectDescendantIds 分支）
  data._db.prepare("UPDATE plans SET task_id = ? WHERE id = ?").run(child.id, plan.id);
  assert.equal(data._db.prepare("SELECT task_id FROM plans WHERE id = ?").get(plan.id).task_id, child.id);

  data.deleteTask(proj.id, parent.id); // 级联删子任务

  const after = data._db.prepare("SELECT task_id FROM plans WHERE id = ?").get(plan.id);
  assert.equal(after.task_id, null, "删除父任务后，指向后代任务的方案关联应一并清空");
});

// ===== 6. deletePlan 清 requirement_plans 关联 =====
test("R11-6：deletePlan 清 requirement_plans 关联（无残留）", () => {
  const proj = data.createProject({ name: "R11-删方案项目" });
  const plan = data.createPlan(proj.id, "关联方案", "<p>x</p>");
  data.createRequirement(proj.id, { name: "关联需求", planIds: [plan.id] });

  // 删除前关联存在
  assert.equal(data.getPlan(proj.id, plan.id).requirements.length, 1);

  data.deletePlan(proj.id, plan.id);

  const cnt = data._db.prepare("SELECT COUNT(*) c FROM requirement_plans WHERE plan_id = ?").get(plan.id).c;
  assert.equal(cnt, 0, "删除方案后 requirement_plans 应无残留");
});

// ===== 7. 启动自愈：清理历史悬空 task_id（R1/R2/R9 场景）=====
test("R11-7：启动自愈清理历史悬空 plans.task_id", () => {
  const proj = data.createProject({ name: "R11-自愈项目" });
  const plan = data.createPlan(proj.id, "悬空方案", "<p>x</p>");
  // 制造悬空：task_id 指向不存在的任务（模拟历史残留）
  data._db.prepare("UPDATE plans SET task_id = ? WHERE id = ?").run("deadbeef", plan.id);
  assert.equal(data._db.prepare("SELECT task_id FROM plans WHERE id = ?").get(plan.id).task_id, "deadbeef");

  // 重新实例化（同一目录）触发启动自愈
  const data2 = createDataAccess(tmpDir);
  const healed = data2.getPlan(null, plan.id);
  assert.equal(healed.taskId, null, "自愈应清空悬空 task_id");
  assert.equal(data2._db.prepare("SELECT task_id FROM plans WHERE id = ?").get(plan.id).task_id, null);
});

// ===== 7b. 启动自愈：清理悬空 requirement_plans 关联 =====
test("R11-7b：启动自愈清理悬空 requirement_plans 关联", () => {
  const proj = data.createProject({ name: "R11-自愈关联项目" });
  const plan = data.createPlan(proj.id, "关联自愈方案", "<p>x</p>");
  // 制造悬空：requirement_plans 指向不存在的需求（方案侧仍有效）
  data._db.prepare("INSERT INTO requirement_plans (requirement_id, plan_id) VALUES (?, ?)").run("deadbeef", plan.id);
  assert.equal(data._db.prepare("SELECT COUNT(*) c FROM requirement_plans WHERE plan_id = ?").get(plan.id).c, 1);

  const data2 = createDataAccess(tmpDir);
  const cnt = data2._db.prepare("SELECT COUNT(*) c FROM requirement_plans WHERE requirement_id = ? AND plan_id = ?").get("deadbeef", plan.id).c;
  assert.equal(cnt, 0, "自愈应清理悬空 requirement_plans 关联");
});

// ===== 8. 工具层：get_requirement / get_plan 仅凭 ID 查询 =====
test("R11-8：工具层 get_requirement / get_plan 不传 projectId 可查详情", async () => {
  const proj = data.createProject({ name: "R11-工具项目" });
  const req = data.createRequirement(proj.id, { name: "工具需求" });
  const plan = data.createPlan(proj.id, "工具方案", "<p>x</p>");

  const getReq = await import("../../tools/get-requirement.js");
  const reqText = (await getReq.execute({ requirementId: req.id }, toolCtx)).content[0].text;
  assert.ok(reqText.includes("工具需求"), `get_requirement 应返回详情，实际: ${reqText}`);
  assert.ok(reqText.includes(req.id), `get_requirement 输出应含完整 ID（${req.id}），实际: ${reqText}`);
  assert.ok(reqText.includes(proj.id), `get_requirement 输出应含 projectId（${proj.id}），实际: ${reqText}`);

  const getPlan = await import("../../tools/get-plan.js");
  const planText = (await getPlan.execute({ planId: plan.id }, toolCtx)).content[0].text;
  assert.ok(planText.includes("工具方案"), `get_plan 应返回详情，实际: ${planText}`);
  assert.ok(planText.includes(plan.id), `get_plan 输出应含完整 ID（${plan.id}），实际: ${planText}`);
  assert.ok(planText.includes(proj.id), `get_plan 输出应含 projectId（${proj.id}），实际: ${planText}`);

  // 短前缀命中详情
  const prefix = req.id.slice(0, 4);
  const reqText2 = (await getReq.execute({ requirementId: prefix }, toolCtx)).content[0].text;
  assert.ok(reqText2.includes("工具需求"), `get_requirement 短前缀应命中，实际: ${reqText2}`);
});
