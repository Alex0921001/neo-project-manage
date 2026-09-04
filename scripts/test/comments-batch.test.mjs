/**
 * 评论批量操作测试（V2.6.2，临时库，不触碰真实数据）
 * 覆盖：同目标批量加评论（整体回滚 + 划词引用透传）/ 批量编辑（逐条独立）/ 批量删除（逐条独立）
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-comment-batch-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

test("评论批量：add 整体回滚 / update·delete 逐条独立 + 双目标类型", () => {
  const proj = data.createProject({ name: "评论批量测试项目" });
  const pid = proj.id;
  const plan = data.createPlan(pid, "评论目标方案", "<p>正文</p>");
  const req = data.createRequirement(pid, { name: "评论目标需求" });

  // 1. 批量加评论（方案）：全成 + 划词引用透传
  const created = data.addComments(pid, "plan", plan.id, [
    { content: "评审意见一" },
    { content: "评审意见二", quoteText: "正文" },
    { content: "评审意见三" },
  ]);
  assert.equal(created.length, 3);
  assert.equal(created[1].quoteText, "正文");
  assert.equal(data.getPlan(pid, plan.id).comments.length, 3);

  // 2. 批量加评论（需求）：目标类型覆盖
  const reqComments = data.addComments(pid, "requirement", req.id, [{ content: "需求疑问" }]);
  assert.equal(reqComments.length, 1);

  // 3. 批量加评论：空内容 → 整体回滚
  assert.throws(() => data.addComments(pid, "plan", plan.id, [
    { content: "会回滚的评论" },
    { content: "  " },
  ]), /第 2 条评论/);
  assert.equal(data.getPlan(pid, plan.id).comments.length, 3, "整体回滚后不应产生新评论");

  // 4. 批量加评论：非法 targetType / 空列表 / 超 50 拒绝
  assert.throws(() => data.addComments(pid, "task", plan.id, [{ content: "x" }]), /不支持的评论对象类型/);
  assert.throws(() => data.addComments(pid, "plan", plan.id, []), /不能为空/);
  assert.throws(() => data.addComments(pid, "plan", plan.id, Array.from({ length: 51 }, () => ({ content: "c" }))), /50/);

  // 5. 批量编辑：全成 + 部分失败逐条生效
  const upd = data.updateComments(pid, [
    { id: created[0].id, content: "评审意见一改" },
    { id: created[1].id, content: "  " },        // 空内容 → 失败
    { id: "不存在id", content: "x" },             // 不存在 → 失败
    {},                                           // 缺 ID → 失败
  ]);
  assert.equal(upd.success.length, 1);
  assert.equal(upd.failed.length, 3);
  assert.match(upd.failed[0].error, /不能为空/);
  assert.match(upd.failed[1].error, /不存在/);
  assert.match(upd.failed[2].error, /缺少评论 ID/);
  const detailAfterUpd = data.getPlan(pid, plan.id);
  assert.equal(detailAfterUpd.comments.find((c) => c.id === created[0].id).content, "评审意见一改");
  assert.equal(detailAfterUpd.comments.find((c) => c.id === created[0].id).edited, true, "编辑后应保留已编辑标记");

  // 6. 批量删除：逐条独立 + 重复 ID + 缺 ID
  const del = data.deleteComments(pid, [created[0].id, created[1].id, created[1].id, ""]);
  assert.equal(del.success.length, 2);
  assert.equal(del.failed.length, 2);
  assert.match(del.failed[0].error, /不存在/);      // created[1] 重复删除
  assert.match(del.failed[1].error, /缺少评论 ID/);
  assert.equal(data.getPlan(pid, plan.id).comments.length, 1); // 仅剩 created[2]

  // 7. 边界：编辑/删除空列表 / 超 50 拒绝
  assert.throws(() => data.updateComments(pid, []), /不能为空/);
  assert.throws(() => data.deleteComments(pid, []), /不能为空/);
  assert.throws(() => data.deleteComments(pid, Array.from({ length: 51 }, () => "x")), /50/);
});
