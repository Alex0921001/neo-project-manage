/**
 * 验证项 Agent 化测试（V2.6.4，临时库，不触碰真实数据）
 * 覆盖：kind/instruction 默认与校验 / 证据回填（落库·自动勾·审计）/ human 项拒绝 / 幂等重跑 / 批量逐条独立 / 工具层输出
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";
import * as tool from "../../tools/report-verification-result.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-verification-agent-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

const proj = data.createProject({ name: "验证Agent化测试项目" });
const pid = proj.id;
const card = data.createVerification(pid, { name: "Agent 化验证卡", note: "自证卡" });

test("db 迁移与默认值：不传 kind 默认 human，instruction/evidence 为空", () => {
  const it = data.createVerificationItem(pid, card.id, { content: "人工检查项" });
  assert.equal(it.kind, "human");
  assert.equal(it.instruction, "");
  assert.equal(it.evidence, null);
});

test("创建 agent 项：kind/instruction 落库；非法 kind 拒绝", () => {
  const it = data.createVerificationItem(pid, card.id, {
    content: "全量测试套件通过", kind: "agent", instruction: "npm test，检查 fail=0", category: "Agent 验证",
  });
  assert.equal(it.kind, "agent");
  assert.equal(it.instruction, "npm test，检查 fail=0");
  assert.throws(
    () => data.createVerificationItem(pid, card.id, { content: "x", kind: "robot" }),
    /非法的执行方式/,
  );
});

test("老路径兼容：toggle 不带 evidence 行为不变", () => {
  const it = data.createVerificationItem(pid, card.id, { content: "toggle 兼容项" });
  const on = data.toggleVerificationItem(pid, it.id);
  assert.equal(on.status, true);
  assert.equal(on.evidence, null);
  assert.equal(on.checkedBy, "owner");
  const off = data.toggleVerificationItem(pid, it.id);
  assert.equal(off.status, false);
});

test("证据回填：agent 项 evidence 落库、自动勾选、checked_by=runner、审计留痕", () => {
  const it = data.createVerificationItem(pid, card.id, { content: "补锚落库断言", kind: "agent", instruction: "查正文含标注 span" });
  const res = data.reportVerificationResult(pid, [
    { id: it.id, evidence: { runner: "agent:common", summary: "正文含 data-quote-comment 标注", detail: "SPAN: <span ...>" } },
  ]);
  assert.equal(res.failed.length, 0);
  assert.equal(res.success[0].updated, false, "首次回填非更新");
  const after = data.listVerificationItems(pid, card.id).items.find((x) => x.id === it.id);
  assert.equal(after.status, true, "自动勾选");
  assert.equal(after.checkedBy, "agent:common");
  assert.equal(after.evidence.runner, "agent:common");
  assert.equal(after.evidence.summary, "正文含 data-quote-comment 标注");
  assert.equal(after.evidence.detail, "SPAN: <span ...>");
  assert.ok(after.evidence.runAt, "runAt 服务端兜底");
  const logs = data.listAuditLogs(pid, { action: "验证通过" });
  assert.ok(logs.items.some((l) => l.targetId === it.id && l.newValue.includes("agent:common")), "审计含证据摘要");
});

test("证据回填：human 项拒绝；缺 runner/summary 失败", () => {
  const human = data.createVerificationItem(pid, card.id, { content: "人工项" });
  const r1 = data.reportVerificationResult(pid, [{ id: human.id, evidence: { runner: "agent:common", summary: "x" } }]);
  assert.equal(r1.success.length, 0);
  assert.match(r1.failed[0].error, /仅支持 agent 项/);
  const agent = data.createVerificationItem(pid, card.id, { content: "缺字段项", kind: "agent" });
  const r2 = data.reportVerificationResult(pid, [{ id: agent.id, evidence: { summary: "无 runner" } }]);
  assert.match(r2.failed[0].error, /runner 不能为空/);
  const r3 = data.reportVerificationResult(pid, [{ id: agent.id, evidence: { runner: "agent:common" } }]);
  assert.match(r3.failed[0].error, /summary 不能为空/);
});

test("证据回填：已勾选项幂等重跑更新证据，审计记「验证证据更新」", () => {
  const it = data.createVerificationItem(pid, card.id, { content: "重跑项", kind: "agent" });
  data.reportVerificationResult(pid, [{ id: it.id, evidence: { runner: "agent:common", summary: "第一轮结论" } }]);
  const res = data.reportVerificationResult(pid, [{ id: it.id, evidence: { runner: "agent:common", summary: "第二轮结论" } }]);
  assert.equal(res.success[0].updated, true);
  const after = data.listVerificationItems(pid, card.id).items.find((x) => x.id === it.id);
  assert.equal(after.evidence.summary, "第二轮结论");
  const logs = data.listAuditLogs(pid, { action: "验证证据更新" });
  assert.ok(logs.items.some((l) => l.targetId === it.id));
});

test("证据回填：批量逐条独立，失败清单带原因", () => {
  const ok1 = data.createVerificationItem(pid, card.id, { content: "批量A", kind: "agent" });
  const bad = data.createVerificationItem(pid, card.id, { content: "批量human" });
  const ok2 = data.createVerificationItem(pid, card.id, { content: "批量B", kind: "agent" });
  const res = data.reportVerificationResult(pid, [
    { id: ok1.id, evidence: { runner: "agent:common", summary: "A 通过" } },
    { id: bad.id, evidence: { runner: "agent:common", summary: "human 项应失败" } },
    { id: "不存在", evidence: { runner: "agent:common", summary: "x" } },
    { id: ok2.id, evidence: { runner: "agent:les", summary: "B 通过" } },
  ]);
  assert.equal(res.success.length, 2);
  assert.equal(res.failed.length, 2);
  assert.match(res.failed[0].error, /仅支持 agent 项/);
  assert.match(res.failed[1].error, /不存在/);
});

test("工具层：execute 成功与失败清单输出", async () => {
  const it = data.createVerificationItem(pid, card.id, { content: "工具层项", kind: "agent" });
  const ok = await tool.execute(
    { projectId: pid, items: [{ id: it.id, evidence: { runner: "agent:common", summary: "工具层通过" } }] },
    { dataDir: tmpDir },
  );
  assert.match(ok.content[0].text, /成功 1 条/);
  const bad = await tool.execute(
    { projectId: pid, items: [{ id: "不存在", evidence: { runner: "a", summary: "s" } }] },
    { dataDir: tmpDir },
  );
  assert.match(bad.content[0].text, /失败 1 条/);
  assert.match(bad.content[0].text, /不存在/);
});
