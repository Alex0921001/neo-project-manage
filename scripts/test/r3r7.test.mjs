/**
 * neo-project-manage V2.2 R3 + R7 回归测试（node:test）
 *
 * 覆盖：
 * 1. v9 迁移：tasks.done_at 列 + SCHEMA_VERSION=9（幂等）
 * 2. updateTask 写/清 done_at（done=true 本地时间，done=false 清空，无回填）
 * 3. updateTasks 批量：逐条独立，单条失败不影响其他条
 * 4. updateAnnotations 批量：任务已完成冻结，冻结条目标失败、其余成功
 * 5. generateReport：完成项按 done_at 落在范围（非创建时间），自定义范围
 *
 * 用法：node --test scripts/test/r3r7.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-r3r7-"));
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

// ===== 1. v9 迁移：done_at 列 + 版本号（R14 已升 v10，版本号断言随当前 SCHEMA_VERSION） =====
test("R3-1：v9 迁移补 tasks.done_at 列，SCHEMA_VERSION 随 R14 升至 10", () => {
  const cols = data._db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  assert.ok(cols.includes("done_at"), "tasks 表应含 done_at 列");
  const version = data._db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get().value;
  assert.equal(Number(version), 10, `schema 版本应为 10，实际 ${version}`);
  // 幂等：再次实例化（同目录）不报错
  const data2 = createDataAccess(tmpDir);
  assert.ok(data2._db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name).includes("done_at"));
});

// ===== 2. updateTask 写/清 done_at =====
test("R3-2：updateTask done=true 写本地时间 done_at，done=false 清空", () => {
  const proj = data.createProject({ name: "R3-完成时间项目" });
  const task = data.createTask(proj.id, { name: "完成时间任务" });

  // 初始无完成时间
  assert.equal(data.getTaskById(task.id).doneAt, "", "新任务 doneAt 应为空");

  // done=true → 写本地时间 ISO
  data.updateTask(proj.id, task.id, { done: true });
  const doneAt = data.getTaskById(task.id).doneAt;
  assert.match(String(doneAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, `done_at 应为本地 ISO，实际: ${doneAt}`);

  // done=false → 清空
  data.updateTask(proj.id, task.id, { done: false });
  assert.equal(data.getTaskById(task.id).doneAt, "", "done=false 后 doneAt 应清空");

  // 再完成 → 重新写（完成→取消→再完成以最新 done_at 为准）
  data.updateTask(proj.id, task.id, { done: true });
  const again = data.getTaskById(task.id).doneAt;
  assert.match(String(again), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.notEqual(again, "", "再完成后应重新写入 done_at");
});

// ===== S1 回归：已完成任务再传 done=true 不刷新 done_at =====
test("R3-S1：已完成任务再传 done=true 不刷新 done_at", () => {
  const proj = data.createProject({ name: "R3-S1-幂等项目" });
  const task = data.createTask(proj.id, { name: "已完成任务" });
  data.updateTask(proj.id, task.id, { done: true });
  // 回填固定 sentinel 时间，验证状态无变化时不覆盖（避免依赖两次调用是否跨秒）
  const sentinel = "2026-08-01T00:00:00";
  data._db.prepare("UPDATE tasks SET done_at = ? WHERE id = ?").run(sentinel, task.id);
  data.updateTask(proj.id, task.id, { done: true }); // 已完成任务再传 done=true，状态无变化
  assert.equal(data.getTaskById(task.id).doneAt, sentinel, "done_at 不应被刷新");
});

// ===== 3. updateTasks 批量：逐条独立 =====
test("R7-1：updateTasks 批量更新，单条失败不影响其他条", () => {
  const proj = data.createProject({ name: "R7-批量任务项目", members: ["张三"] });
  const t1 = data.createTask(proj.id, { name: "任务甲", assignees: ["张三"] });
  const t2 = data.createTask(proj.id, { name: "任务乙", assignees: ["张三"] });
  // t2 挂一条未确认便利贴，使其 done=true 校验失败
  data.createAnnotation(proj.id, t2.id, { content: "未确认批注" });

  const res = data.updateTasks(proj.id, [
    { id: t1.id, name: "任务甲-改" },
    { id: t2.id, done: true }, // 便利贴未确认 → 该条失败
  ]);

  assert.equal(res.success.length, 1, "应 1 条成功");
  assert.equal(res.failed.length, 1, "应 1 条失败");
  assert.equal(res.success[0].id, t1.id);
  assert.equal(res.failed[0].id, t2.id);
  assert.match(res.failed[0].error, /便利贴|确认/, `失败原因应含便利贴提示，实际: ${res.failed[0].error}`);

  // 成功条已生效，失败条保持未完成
  assert.equal(data.getTaskById(t1.id).name, "任务甲-改");
  assert.equal(data.getTaskById(t2.id).done, false);

  // 上限：超 50 条整体拒绝
  const many = Array.from({ length: 51 }, (_, i) => ({ id: `x${i}` }));
  expectThrow(() => data.updateTasks(proj.id, many), /50/);
});

// ===== S2 回归：批量完成含未完成子任务的父任务进 failed，其余成功 =====
test("R7-S2：批量完成含未完成子任务的父任务进 failed，其余成功", () => {
  const proj = data.createProject({ name: "R7-S2-矛盾树项目" });
  const parent = data.createTask(proj.id, { name: "父任务" });
  data.createTask(proj.id, { name: "子任务", parentTaskId: parent.id });
  const leaf = data.createTask(proj.id, { name: "叶子任务" });

  // 单任务/工具路径同样被后端拦截（防绕过）
  expectThrow(() => data.updateTask(proj.id, parent.id, { done: true }), /子任务未完成/);

  const res = data.updateTasks(proj.id, [
    { id: parent.id, done: true }, // 含未完成子任务 → 失败
    { id: leaf.id, done: true },   // 无后代 → 成功
  ]);

  assert.equal(res.success.length, 1, "叶子任务应成功");
  assert.equal(res.failed.length, 1, "父任务应失败");
  assert.equal(res.failed[0].id, parent.id);
  assert.match(res.failed[0].error, /子任务未完成/, `失败原因应含子任务提示，实际: ${res.failed[0].error}`);
  assert.equal(data.getTaskById(parent.id).done, false, "父任务应保持未完成");
  assert.equal(data.getTaskById(leaf.id).done, true, "叶子任务应已完成");
});

// ===== 4. updateAnnotations 批量：冻结语义 =====
test("R7-2：updateAnnotations 批量更新，已完成任务便利贴冻结", () => {
  const proj = data.createProject({ name: "R7-批量批注项目" });
  const t1 = data.createTask(proj.id, { name: "冻结任务" });
  const t2 = data.createTask(proj.id, { name: "活动任务" });
  const a1 = data.createAnnotation(proj.id, t1.id, { content: "将被冻结" });
  const a2 = data.createAnnotation(proj.id, t2.id, { content: "可修改" });

  // t1 完成（先确认便利贴）
  data.updateAnnotation(t1.id, a1.id, { confirmed: true });
  data.updateTask(proj.id, t1.id, { done: true });

  const res = data.updateAnnotations(proj.id, [
    { id: a1.id, content: "改冻结批注" },
    { id: a2.id, content: "改活动批注" },
  ]);

  assert.equal(res.success.length, 1, "活动任务批注应成功");
  assert.equal(res.failed.length, 1, "冻结批注应失败");
  assert.equal(res.success[0].id, a2.id);
  assert.equal(res.failed[0].id, a1.id);
  assert.match(res.failed[0].error, /冻结|已完成/, `失败原因应含冻结提示，实际: ${res.failed[0].error}`);

  assert.equal(data.getTaskAnnotations(t2.id)[0].content, "改活动批注");
  assert.equal(data.getTaskAnnotations(t1.id)[0].content, "将被冻结", "冻结批注内容应保持不变");

  // 跨项目拒绝：用另一项目调用 a2
  const projB = data.createProject({ name: "R7-另一项目" });
  const resB = data.updateAnnotations(projB.id, [{ id: a2.id, content: "跨项目" }]);
  assert.equal(resB.success.length, 0);
  assert.equal(resB.failed.length, 1);
  assert.match(resB.failed[0].error, /不存在或不属于/, "跨项目批注应失败");
});

// ===== 5. generateReport：done_at 范围过滤 =====
test("R3-3：generateReport 完成项按 done_at 落在范围（非创建时间）", () => {
  const proj = data.createProject({ name: "R3-周报项目", members: ["李四"] });
  const tA = data.createTask(proj.id, { name: "范围内任务", assignees: ["李四"] });
  const tB = data.createTask(proj.id, { name: "范围外任务" });

  // 手工指定 done_at 便于确定性断言（tA 在范围内，tB 在范围外）
  data._db.prepare("UPDATE tasks SET done = 1, done_at = ? WHERE id = ?").run("2026-08-10T10:00:00", tA.id);
  data._db.prepare("UPDATE tasks SET done = 1, done_at = ? WHERE id = ?").run("2026-08-01T10:00:00", tB.id);

  const rep = data.generateReport(proj.id, { range: "custom", startDate: "2026-08-08", endDate: "2026-08-12" });
  assert.match(rep.markdown, /R3-周报项目/);
  assert.match(rep.markdown, /范围内任务/);
  assert.ok(!rep.markdown.includes("范围外任务"), "范围外完成任务不应出现在完成项");
  assert.match(rep.markdown, /负责人：李四/, "完成项应含责任人");
  assert.equal(rep.range.label, "自定义");
  assert.equal(rep.range.start, "2026-08-08");
  assert.equal(rep.range.end, "2026-08-12");

  // 空数据周兜底文案
  const empty = data.generateReport(proj.id, { range: "custom", startDate: "2020-01-01", endDate: "2020-01-02" });
  assert.match(empty.markdown, /暂无已完成任务/);

  // 非法 range
  expectThrow(() => data.generateReport(proj.id, { range: "yearly" }), /range 仅支持/);
  // 自定义缺日期
  expectThrow(() => data.generateReport(proj.id, { range: "custom" }), /startDate|endDate/);
});

// ===== 6. 工具层：generate_report / update_tasks / update_annotations =====
test("R3/R7-工具层：generate_report / update_tasks / update_annotations 可用", async () => {
  const toolCtx = { dataDir: tmpDir, log: console };
  const proj = data.createProject({ name: "R3R7-工具项目", members: ["王五"] });
  const t1 = data.createTask(proj.id, { name: "工具任务", assignees: ["王五"] });

  const genReport = await import("../../tools/generate-report.js");
  const repTxt = (await genReport.execute({ projectId: proj.id, range: "thisWeek" }, toolCtx)).content[0].text;
  assert.match(repTxt, /R3R7-工具项目/);

  const updTasks = await import("../../tools/update-tasks.js");
  const utTxt = (await updTasks.execute({ projectId: proj.id, tasks: [{ id: t1.id, name: "工具任务-改" }] }, toolCtx)).content[0].text;
  assert.match(utTxt, /成功 1 条/);

  const updAnns = await import("../../tools/update-annotations.js");
  const ann = data.createAnnotation(proj.id, t1.id, { content: "工具批注" });
  const uaTxt = (await updAnns.execute({ projectId: proj.id, annotations: [{ id: ann.id, content: "工具批注-改" }] }, toolCtx)).content[0].text;
  assert.match(uaTxt, /成功 1 条/);
  assert.equal(data.getTaskAnnotations(t1.id)[0].content, "工具批注-改");
});
