/**
 * 验证模块批量操作测试（V2.6.2，临时库，不触碰真实数据）
 * 覆盖：批量建卡/灌项（整体回滚）/ 批量编辑·勾选·删除（逐条独立 + 幂等 + 审计）
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-verif-batch-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

test("验证批量：create 卡/项整体回滚 / toggle 幂等 / update·delete 逐条独立 + 审计", () => {
  const proj = data.createProject({ name: "验证批量测试项目" });
  const pid = proj.id;
  const task = data.createTask(pid, { name: "关联任务" });

  // 1. 批量建卡：全成（含关联任务）
  const cards = data.createVerifications(pid, [
    { name: "登录验证卡", taskIds: [task.id], note: "n1" },
    { name: "报表验证卡" },
    { name: "会回滚的卡" },
  ]);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards[0].taskIds, [task.id]);

  // 2. 批量建卡：名称缺失 → 整体回滚
  assert.throws(() => data.createVerifications(pid, [
    { name: "另一张卡" },
    { name: "  " },
  ]), /第 2 个验证卡/);
  assert.equal(data.listVerifications(pid, {}).total, 3, "整体回滚后不应产生新卡");

  // 3. 批量灌项：全成（含分类）
  const items = data.createVerificationItems(pid, cards[0].id, [
    { content: "检查项A", category: "功能验证" },
    { content: "检查项B" },
    { content: "检查项C", note: "备注C" },
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].category, "功能验证");
  assert.equal(data.listVerificationItems(pid, cards[0].id).total, 3);

  // 4. 批量灌项：内容缺失 → 整体回滚 + 卡不存在拒绝
  assert.throws(() => data.createVerificationItems(pid, cards[0].id, [
    { content: "会回滚的项" },
    { content: "" },
  ]), /第 2 个验证项/);
  assert.equal(data.listVerificationItems(pid, cards[0].id).total, 3);
  assert.throws(() => data.createVerificationItems(pid, "不存在卡", [{ content: "x" }]), /不存在/);

  // 5. 批量勾选：目标态 + 幂等（重复勾选不重复写审计）
  const t1 = data.toggleVerificationItems(pid, [
    { id: items[0].id, done: true },
    { id: items[1].id, done: true },
    { id: items[1].id, done: true },  // 幂等：已是目标态
    { id: items[2].id, done: true },
  ]);
  assert.equal(t1.success.length, 4);
  assert.ok(t1.success.every((s) => s.status === true));
  const itemsAfter = data.listVerificationItems(pid, cards[0].id).items;
  assert.ok(itemsAfter.every((x) => x.status === true));
  assert.ok(itemsAfter.every((x) => x.checkedAt && x.checkedBy), "打勾应写入勾选时间与操作人");

  // 6. 批量退回 + 混合目标态 + 参数校验
  const t2 = data.toggleVerificationItems(pid, [
    { id: items[0].id, done: false },
    { id: items[1].id, done: "yes" },  // 非布尔 → 失败
    { id: "不存在id", done: true },     // 不存在 → 失败
    {},                                 // 缺 ID → 失败
  ]);
  assert.equal(t2.success.length, 1);
  assert.equal(t2.failed.length, 3);
  assert.match(t2.failed[0].error, /布尔/);
  assert.match(t2.failed[1].error, /不存在/);
  assert.match(t2.failed[2].error, /缺少验证项 ID/);
  assert.equal(data.listVerificationItems(pid, cards[0].id).items.find((x) => x.id === items[0].id).status, false);

  // 7. 批量编辑：逐条独立（改内容 + 空内容失败）
  const upd = data.updateVerificationItems(pid, [
    { id: items[0].id, content: "检查项A改", note: "新备注" },
    { id: items[1].id, content: " " },  // 空内容 → 失败
    {},                                  // 缺 ID → 失败
  ]);
  assert.equal(upd.success.length, 1);
  assert.equal(upd.failed.length, 2);
  assert.match(upd.failed[0].error, /不能为空/);
  assert.match(upd.failed[1].error, /缺少验证项 ID/);
  assert.equal(data.listVerificationItems(pid, cards[0].id).items.find((x) => x.id === items[0].id).content, "检查项A改");

  // 8. 批量删项：逐条独立 + 重复 ID
  const delItems = data.deleteVerificationItems(pid, [items[2].id, items[2].id, ""]);
  assert.equal(delItems.success.length, 1);
  assert.equal(delItems.failed.length, 2);
  assert.match(delItems.failed[0].error, /不存在/);
  assert.equal(data.listVerificationItems(pid, cards[0].id).total, 2);

  // 9. 批量删卡：级联删项 + 重复 ID
  const delCards = data.deleteVerifications(pid, [cards[0].id, cards[1].id, cards[1].id]);
  assert.equal(delCards.success.length, 2);
  assert.equal(delCards.failed.length, 1);
  assert.match(delCards.failed[0].error, /不存在/);
  assert.equal(data.listVerifications(pid, {}).total, 1); // 仅剩 cards[2]

  // 10. 审计联动：勾选/退回/创建验证项均逐条留痕
  const audit = data.listAuditLogs(pid, {});
  const actions = new Set(audit.items.map((a) => a.action));
  ["创建验证", "创建验证项", "验证通过", "验证退回", "编辑验证项", "删除验证项", "删除验证"].forEach((a) =>
    assert.ok(actions.has(a), `审计应包含 ${a}`)
  );

  // 11. 边界：空列表 / 超 50 拒绝
  assert.throws(() => data.createVerifications(pid, []), /不能为空/);
  assert.throws(() => data.toggleVerificationItems(pid, []), /不能为空/);
  assert.throws(() => data.deleteVerifications(pid, []), /不能为空/);
  assert.throws(() => data.deleteVerificationItems(pid, Array.from({ length: 51 }, () => "x")), /50/);
});
