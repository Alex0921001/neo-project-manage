/**
 * 临时任务批量操作测试（V2.6.2，临时库，不触碰真实数据）
 * 覆盖：批量创建（整体回滚）/ 批量更新（逐条独立 + 状态限制）/ 批量删除（逐条独立 + 归档防呆）
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-quick-batch-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

test("临时任务批量：create 整体回滚 / update·delete 逐条独立 + 归档防呆", () => {
  // 1. 批量创建：全成
  const created = data.createQuickTasks([
    { content: "批量随手记一" },
    { content: "批量随手记二" },
    { content: "批量随手记三" },
  ]);
  assert.equal(created.length, 3);
  assert.ok(created.every((t) => t.status === "active"));

  // 2. 批量创建：内容缺失 → 整体回滚
  assert.throws(() => data.createQuickTasks([
    { content: "会回滚的随手记" },
    { content: "   " },
  ]), /第 2 个临时任务/);
  assert.equal(data.listQuickTasks().length, 3, "整体回滚后不应产生新任务");

  // 3. 批量创建：空列表 / 超 50 拒绝
  assert.throws(() => data.createQuickTasks([]), /不能为空/);
  assert.throws(() => data.createQuickTasks(Array.from({ length: 51 }, (_, i) => ({ content: `c${i}` }))), /50/);

  const [q1, q2, q3] = created;

  // 4. 批量更新：完成/编辑全成 + 状态限制逐条生效
  const upd = data.updateQuickTasks([
    { id: q1.id, action: "complete" },
    { id: q2.id, content: "批量随手记二改" },
    { id: q3.id, action: "complete" },
    { id: q3.id, action: "reopen" },
    { id: q2.id, action: "reopen" },   // q2 是 active，不可退回 → 失败
    { id: "不存在id", content: "x" },   // 不存在 → 失败
    {},                                  // 缺 ID → 失败
  ]);
  assert.equal(upd.success.length, 4);
  assert.equal(upd.failed.length, 3);
  assert.equal(upd.success[0].status, "done");
  assert.equal(upd.success[3].status, "active");
  assert.match(upd.failed[0].error, /仅已完成任务可退回/);
  assert.match(upd.failed[1].error, /不存在/);
  assert.match(upd.failed[2].error, /缺少临时任务 ID/);
  assert.equal(data.listQuickTasks().find((t) => t.id === q2.id).content, "批量随手记二改");

  // 5. 已转化不可退回（先转化 q3，再批量退回 q3 失败）
  const proj = data.createProject({ name: "转化目标项目" });
  data.convertQuickTask(q3.id, { projectId: proj.id });
  const conv = data.updateQuickTasks([{ id: q3.id, action: "reopen" }]);
  assert.equal(conv.success.length, 0);
  assert.equal(conv.failed.length, 1);
  assert.match(conv.failed[0].error, /已转化的任务不可退回/);

  // 6. 批量删除：逐条独立 + 重复 ID + 归档防呆
  data.archiveQuickTask(q1.id); // q1 done → archived
  const del = data.deleteQuickTasks([q1.id, q2.id, q3.id, q3.id, ""]);
  assert.equal(del.success.length, 2);
  assert.equal(del.success[0].id, q2.id);
  assert.equal(del.failed.length, 3);
  assert.match(del.failed[0].error, /归档弹窗/);  // q1 已归档
  assert.match(del.failed[1].error, /不存在/);    // q3 重复删除
  assert.match(del.failed[2].error, /缺少临时任务 ID/);
  assert.equal(data.listQuickTasks().length, 0); // q2/q3 已删，q1 归档不在主列表

  // 7. 边界：空列表 / 超 50 拒绝
  assert.throws(() => data.updateQuickTasks([]), /不能为空/);
  assert.throws(() => data.deleteQuickTasks([]), /不能为空/);
  assert.throws(() => data.deleteQuickTasks(Array.from({ length: 51 }, () => "x")), /50/);
});
