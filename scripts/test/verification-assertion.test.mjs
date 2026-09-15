/**
 * 数据断言（kind=assertion）测试（临时库，不触碰真实数据）
 * 覆盖：四元组解析（invalid 语义）/ 各操作符 / 表名白名单 / JSON 列解析 / 目标不存在 /
 * 批量逐条独立 / 通过自动勾 + 证据回填 + 幂等重跑审计 / 失败拒勾 / 非断言项拒绝 / 工具层输出
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";
import * as tool from "../../tools/verify-assertion-items.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-verification-assertion-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

const proj = data.createProject({ name: "数据断言测试项目" });
const pid = proj.id;
const plan = data.createPlan(pid, "断言方案 OAuth2 选型", "<p>正文含锚点段落，用于评论引用。</p>");
const task = data.createTask(pid, { name: "断言任务", priority: "P1", startDate: "2026-09-01" });
const comment = data.addComment(pid, "plan", plan.id, "断言评论", "锚点段落");
const ann = data.createAnnotation(pid, task.id, { content: "断言批注" });
const card = data.createVerification(pid, { name: "断言验证卡" });

function mkItem(instruction) {
  return data.createVerificationItem(pid, card.id, { content: "断言项", kind: "assertion", instruction });
}

test("断言项 CRUD：kind=assertion + instruction 四元组 JSON 落库；非 JSON 创建时不报错（执行期判 invalid）", () => {
  const it = data.createVerificationItem(pid, card.id, {
    content: "评论引用锚点已落库", kind: "assertion",
    instruction: JSON.stringify({ target: `comments:${comment.id}`, field: "quote_anchor", op: "not_null" }),
  });
  assert.equal(it.kind, "assertion");
  assert.ok(it.instruction.includes(comment.id));
  const bad = data.createVerificationItem(pid, card.id, { content: "坏定义项", kind: "assertion", instruction: "这不是 JSON" });
  assert.equal(bad.instruction, "这不是 JSON"); // 结构合法性推迟到执行
});

test("runAssertion：not_null / null", () => {
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `comments:${comment.id}`, field: "quote_anchor", op: "not_null" })))).state, "pass");
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "start_date", op: "null", value: null })))).state, "fail");
  const t2 = data.createTask(pid, { name: "无日期任务" });
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${t2.id}`, field: "start_date", op: "null" })))).state, "pass");
});

test("runAssertion：eq / neq（字符串与数值宽容比较）", () => {
  // 字符串 eq
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "priority", op: "eq", value: "P1" })))).state, "pass");
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "priority", op: "eq", value: "P0" })))).state, "fail");
  // 数值 eq（SQLite 整数 0/1 与期望数字）
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "done", op: "eq", value: 0 })))).state, "pass");
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "done", op: "eq", value: 1 })))).state, "fail");
  // 空串不做数值巧合比较（Number("") === 0 不应误判相等）
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "end_date", op: "eq", value: 0 })))).state, "fail");
  // neq
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "priority", op: "neq", value: "P0" })))).state, "pass");
});

test("runAssertion：gt / gte / lt / lte（annotations.confirmed 整数列）", () => {
  const s = (op, v) => data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `annotations:${ann.id}`, field: "confirmed", op, value: v }))));
  assert.equal(s("lt", 1).state, "pass");
  assert.equal(s("gte", 0).state, "pass");
  assert.equal(s("gt", 0).state, "fail");
  assert.equal(s("lte", 0).state, "pass");
  // 非数值字段做数值比较 → fail 带原因
  const r = data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `annotations:${ann.id}`, field: "content", op: "gt", value: 0 }))));
  assert.equal(r.state, "fail");
  assert.match(r.reason, /不是数值/);
});

test("runAssertion：contains（字符串包含）", () => {
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `plans:${plan.id}`, field: "title", op: "contains", value: "OAuth2" })))).state, "pass");
  assert.equal(data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `plans:${plan.id}`, field: "title", op: "contains", value: "不存在的词" })))).state, "fail");
});

test("runAssertion：JSON 列解析后参与比较（comments.quote_anchor）", () => {
  const stored = data.getComments(pid, "plan", plan.id).find((c) => c.id === comment.id);
  assert.ok(stored.quoteAnchor, "补锚应产生 JSON 锚点");
  const anchorObj = typeof stored.quoteAnchor === "string" ? JSON.parse(stored.quoteAnchor) : stored.quoteAnchor;
  // eq 期望对象（JSON 列取解析后的对象比较）
  assert.equal(
    data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `comments:${comment.id}`, field: "quote_anchor", op: "eq", value: anchorObj })))).state,
    "pass",
  );
});

test("runAssertion：invalid 三态（坏 JSON / 白名单外表 / 非法操作符 / 未知字段）", () => {
  const r1 = data.runAssertion(itemRow(mkItem("这不是 JSON")));
  assert.equal(r1.state, "invalid");
  const r2 = data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `audit_logs:${comment.id}`, field: "action", op: "eq", value: "x" }))));
  assert.equal(r2.state, "invalid");
  assert.match(r2.reason, /白名单/);
  const r3 = data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "name", op: "regex", value: "x" }))));
  assert.equal(r3.state, "invalid");
  const r4 = data.runAssertion(itemRow(mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "no_such_field", op: "eq", value: "x" }))));
  assert.equal(r4.state, "invalid");
  assert.match(r4.reason, /无字段/);
});

test("runAssertion：目标不存在 → fail（非 invalid）", () => {
  const r = data.runAssertion(itemRow(mkItem(JSON.stringify({ target: "tasks:zzzzzzzz", field: "name", op: "not_null" }))));
  assert.equal(r.state, "fail");
  assert.match(r.reason, /不存在/);
});

test("verifyAssertionItems：通过自动勾 + 证据回填 + 幂等重跑审计「验证证据更新」", () => {
  const it = mkItem(JSON.stringify({ target: `comments:${comment.id}`, field: "quote_anchor", op: "not_null" }));
  const res = data.verifyAssertionItems(pid, [it.id]);
  assert.equal(res.failed.length, 0);
  assert.equal(res.success[0].updated, false);
  assert.match(res.success[0].summary, /quote_anchor 非空/);
  const after = data.listVerificationItems(pid, card.id).items.find((x) => x.id === it.id);
  assert.equal(after.status, true, "自动勾选");
  assert.equal(after.checkedBy, "assertion");
  assert.equal(after.evidence.runner, "assertion");
  assert.ok(after.evidence.summary, "证据含摘要");
  // 重跑：幂等更新证据
  const res2 = data.verifyAssertionItems(pid, [it.id]);
  assert.equal(res2.success[0].updated, true);
  const logs = data.listAuditLogs(pid, { action: "验证证据更新" });
  assert.ok(logs.items.some((l) => l.targetId === it.id));
});

test("verifyAssertionItems：批量逐条独立（通过 / 失败拒勾 / 不存在 / 非断言项）", () => {
  const pass = mkItem(JSON.stringify({ target: `plans:${plan.id}`, field: "title", op: "contains", value: "断言" }));
  const fail = mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "priority", op: "eq", value: "P0" }));
  const agent = data.createVerificationItem(pid, card.id, { content: "agent 项", kind: "agent", instruction: "npm test" });
  const res = data.verifyAssertionItems(pid, [pass.id, fail.id, "不存在", agent.id]);
  assert.equal(res.success.length, 1);
  assert.equal(res.failed.length, 3);
  assert.match(res.failed[0].error, /断言未通过/);
  assert.match(res.failed[1].error, /不存在/);
  assert.match(res.failed[2].error, /仅支持 assertion 项/);
  // 失败项拒勾
  const failRow = data.listVerificationItems(pid, card.id).items.find((x) => x.id === fail.id);
  assert.equal(failRow.status, false, "失败项不得勾选");
  assert.equal(failRow.evidence, null, "失败项不回填证据");
});

test("verifyAssertionItems：invalid / 输入校验", () => {
  const bad = mkItem("坏 JSON");
  const res = data.verifyAssertionItems(pid, [bad.id]);
  assert.equal(res.success.length, 0);
  assert.match(res.failed[0].error, /断言定义无效/);
  assert.throws(() => data.verifyAssertionItems(pid, []), /ids 不能为空/);
  assert.throws(() => data.verifyAssertionItems(pid, new Array(51).fill("x")), /50/);
});

test("工具层：verify_assertion_items 输出成功/失败清单", async () => {
  const ok = mkItem(JSON.stringify({ target: `tasks:${task.id}`, field: "name", op: "contains", value: "断言" }));
  const res = await tool.execute({ projectId: pid, ids: [ok.id] }, { dataDir: tmpDir });
  assert.match(res.content[0].text, /成功 1 条/);
  assert.match(res.content[0].text, /断言通过/);
  const bad = await tool.execute({ projectId: pid, ids: ["不存在"] }, { dataDir: tmpDir });
  assert.match(bad.content[0].text, /失败 1 条/);
});

/** 取验证项原始行（含 instruction 原始字符串，供 runAssertion 直接消费；传对象或 id 均可） */
function itemRow(idOrItem) {
  const id = typeof idOrItem === "object" && idOrItem ? idOrItem.id : idOrItem;
  return data._db.prepare("SELECT * FROM verification_items WHERE id = ?").get(id);
}
