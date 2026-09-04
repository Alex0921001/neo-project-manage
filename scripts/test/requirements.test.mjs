/**
 * 需求模块全接口测试（临时库，不触碰真实数据）
 * 用法：node scripts/test/requirements.test.mjs
 * 覆盖：列表(分页/status/keyword) / 详情 / 新建 / 编辑 / 状态流转 / 删除 / 关联方案 / 解除关联
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";
import { registerRequirementsRoutes } from "../../routes/modules/requirements.js";
import { registerPlansRoutes } from "../../routes/modules/plans.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-req-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

// ===== 模拟 hattip =====
function mockApp() {
  const routes = [];
  const add = (m) => (p, h) => routes.push({ m, p, h });
  return { get: add("GET"), post: add("POST"), put: add("PUT"), delete: add("DELETE"), routes };
}
function mockC(params, query = {}, body = null) {
  return {
    req: { param: (k) => params[k] ?? null, query: () => query, json: async () => body },
    json: (obj, status = 200) => ({ status, body: JSON.stringify(obj) }),
  };
}
function routeMatch(route, method, path) {
  if (route.m !== method) return null;
  const segs = route.p.split("/").filter(Boolean);
  const psegs = path.split("/").filter(Boolean);
  if (segs.length !== psegs.length) return null;
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].startsWith(":")) params[segs[i].slice(1)] = psegs[i];
    else if (segs[i] !== psegs[i]) return null;
  }
  return params;
}
async function call(app, method, path, query = {}, body = null) {
  let hit = null;
  for (const r of app.routes) {
    const params = routeMatch(r, method, path);
    if (params) { hit = { r, params }; break; }
  }
  assert.ok(hit, `应有匹配路由: ${method} ${path}`);
  const c = mockC(hit.params, query, body);
  const res = await hit.r.h(c);
  let parsed;
  try { parsed = JSON.parse(res.body); }
  catch (e) { throw new Error(`响应体非法 JSON(${res.status}): ${e.message}`); }
  assert.equal(res.status, 200, `应返回 200（实际 ${res.status}: ${parsed.error || ""}）`);
  assert.equal(parsed.ok, true, `ok 应为 true（error: ${parsed.error || ""}）`);
  return parsed.data;
}

// ===== 测试 =====
test("需求：全接口链路", async () => {
  const app = mockApp();
  registerRequirementsRoutes(app, data);
  registerPlansRoutes(app, data);

  // 准备：项目 + 2 个方案（关联数据源）
  const proj = data.createProject({ name: "需求测试项目" });
  const pid = proj.id;
  const planA = data.createPlan(pid, "方案甲", "<p>甲</p>");
  const planB = data.createPlan(pid, "方案乙", "<p>乙</p>");

  // 1. 新建
  const created = await call(app, "POST", `/api/projects/${pid}/requirements`, {}, {
    name: "需求一", description: "<p>第一版</p>", priority: "P2", planIds: [planA.id],
  });
  assert.equal(created.name, "需求一");
  assert.equal(created.status, "待处理");
  assert.deepEqual(created.planIds, [planA.id]);
  const rid = created.id;

  // 2. 详情（含关联方案明细）
  const detail = await call(app, "GET", `/api/projects/${pid}/requirements/${rid}`);
  assert.equal(detail.id, rid);
  assert.ok(Array.isArray(detail.plans));
  assert.equal(detail.plans.length, 1);

  // 3. 列表（分页 / status / keyword）
  let list = await call(app, "GET", `/api/projects/${pid}/requirements`, { limit: "10", offset: "0" });
  assert.equal(list.total, 1);
  assert.equal(list.items[0].planCount, 1);
  list = await call(app, "GET", `/api/projects/${pid}/requirements`, { status: "已完成" });
  assert.equal(list.total, 0);
  list = await call(app, "GET", `/api/projects/${pid}/requirements`, { keyword: "需求" });
  assert.equal(list.total, 1);
  list = await call(app, "GET", `/api/projects/${pid}/requirements`, { keyword: "不存在" });
  assert.equal(list.total, 0);

  // 4. 编辑
  const updated = await call(app, "PUT", `/api/projects/${pid}/requirements/${rid}`, {}, {
    name: "需求一（改）", description: "<p>第二版</p>", priority: "P1", planIds: [planA.id, planB.id],
  });
  assert.equal(updated.name, "需求一（改）");
  assert.equal(updated.priority, "P1");
  assert.deepEqual([...updated.planIds].sort(), [planA.id, planB.id].sort());

  // 5. 状态流转（终态不可逆：已完成/已取消不可再变更）
  const done = await call(app, "PUT", `/api/projects/${pid}/requirements/${rid}/status`, {}, { status: "已完成" });
  assert.equal(done.status, "已完成");
  const r2 = data.createRequirement(pid, { name: "需求二", description: "", priority: "P3", planIds: [] });
  const canceled = await call(app, "PUT", `/api/projects/${pid}/requirements/${r2.id}/status`, {}, { status: "已取消" });
  assert.equal(canceled.status, "已取消");
  // 终态可切回待处理（V2.1.4 放开状态机）
  const backTodo = await call(app, "PUT", `/api/projects/${pid}/requirements/${rid}/status`, {}, { status: "待处理" });
  assert.equal(backTodo.status, "待处理");

  // 6. 解除关联
  const unlinked = await call(app, "DELETE", `/api/projects/${pid}/requirements/${rid}/plans`, {}, { planIds: [planA.id] });
  assert.equal(unlinked.unlinked, 1);
  const detail2 = await call(app, "GET", `/api/projects/${pid}/requirements/${rid}`);
  assert.deepEqual([...detail2.planIds].sort(), [planB.id]);

  // 7. 删除
  await call(app, "DELETE", `/api/projects/${pid}/requirements/${rid}`);
  const afterDel = await call(app, "GET", `/api/projects/${pid}/requirements`);
  assert.equal(afterDel.total, 1); // 仅剩「需求二」
  assert.ok(!afterDel.items.some((i) => i.id === rid), "被删需求不应在列表");
  await call(app, "DELETE", `/api/projects/${pid}/requirements/${r2.id}`);
  const final = await call(app, "GET", `/api/projects/${pid}/requirements`);
  assert.equal(final.total, 0);
});

test("需求：非法参数返回 ok=false 而非 500", async () => {
  const app = mockApp();
  registerRequirementsRoutes(app, data);
  const proj = data.createProject({ name: "校验项目" });
  const pid = proj.id;
  // 空名称 → 应返回 400 + 合法 JSON（ok=false）
  let hit = null;
  for (const r of app.routes) {
    const params = routeMatch(r, "POST", `/api/projects/${pid}/requirements`);
    if (params) { hit = { r, params }; break; }
  }
  assert.ok(hit);
  const c = mockC(hit.params, {}, { name: "", description: "", priority: "P3", planIds: [] });
  const res = await hit.r.h(c);
  assert.equal(res.status, 400);
  let parsed;
  try { parsed = JSON.parse(res.body); }
  catch (e) { throw new Error(`响应体非法 JSON: ${e.message}`); }
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error);
});

// ===== 批量操作（V2.6.2）=====
test("需求批量：create 整体回滚 / update·status·delete 逐条独立", () => {
  const proj = data.createProject({ name: "需求批量测试项目" });
  const pid = proj.id;
  const planA = data.createPlan(pid, "关联方案", "<p>甲</p>");

  // 1. 批量创建：全成（含关联方案 + 优先级）
  const created = data.createRequirements(pid, [
    { name: "批量需求一", priority: "P1", planIds: [planA.id] },
    { name: "批量需求二", description: "<p>描述</p>" },
    { name: "批量需求三" },
  ]);
  assert.equal(created.length, 3);
  assert.equal(created[0].priority, "P1");
  assert.deepEqual(created[0].planIds, [planA.id]);
  assert.equal(created[2].status, "待处理");

  // 2. 批量创建：名称缺失 → 整体回滚（对齐 createTasks 范式），库里不产生半批数据
  assert.throws(() => data.createRequirements(pid, [
    { name: "会回滚的需求" },
    { name: "  " },
  ]), /第 2 个需求/);
  const listAfterRollback = data.listRequirements(pid, {});
  assert.equal(listAfterRollback.total, 3, "整体回滚后不应产生新需求");

  // 3. 批量创建：空列表 / 超 50 拒绝
  assert.throws(() => data.createRequirements(pid, []), /不能为空/);
  assert.throws(() => data.createRequirements(pid, Array.from({ length: 51 }, (_, i) => ({ name: `n${i}` }))), /50/);

  // 4. 批量编辑：全成 + 部分失败（已完成不可改）逐条生效
  const [r1, r2] = created;
  data.updateRequirementStatus(pid, r2.id, "已完成");
  const upd = data.updateRequirements(pid, [
    { id: r1.id, name: "批量需求一改", priority: "P0" },
    { id: r2.id, name: "不应生效" },      // 已完成 → 失败
    { id: "不存在id", name: "x" },        // 不存在 → 失败
    {},                                     // 缺 ID → 失败
  ]);
  assert.equal(upd.success.length, 1);
  assert.equal(upd.success[0].name, "批量需求一改");
  assert.equal(upd.failed.length, 3);
  assert.match(upd.failed[0].error, /不可修改/);
  assert.match(upd.failed[1].error, /不存在/);
  assert.match(upd.failed[2].error, /缺少需求 ID/);
  assert.equal(data.getRequirement(pid, r1.id).priority, "P0");
  assert.equal(data.getRequirement(pid, r2.id).name, "批量需求二", "失败条不应被改动");

  // 5. 批量流转：全成 + 非法状态失败 + 同目标态幂等
  const st = data.updateRequirementStatuses(pid, [
    { id: r1.id, status: "已完成" },
    { id: r1.id, status: "已完成" }, // 幂等：相同状态直接成功
    { id: r2.id, status: "非法状态" },
  ]);
  assert.equal(st.success.length, 2);
  assert.equal(st.success[1].status, "已完成");
  assert.equal(st.failed.length, 1);
  assert.match(st.failed[0].error, /无效需求状态/);

  // 6. 批量删除：部分失败（已完成不可删）逐条生效 + 重复 ID 二次删报不存在
  const r3 = created[2];
  const del = data.deleteRequirements(pid, [r1.id, r2.id, r3.id, r3.id, ""]);
  assert.equal(del.success.length, 1);
  assert.equal(del.success[0].id, r3.id);
  assert.equal(del.failed.length, 4);
  assert.match(del.failed[0].error, /不可删除/); // r1 已完成
  assert.match(del.failed[1].error, /不可删除/); // r2 已完成
  assert.match(del.failed[2].error, /不存在/);   // r3 重复删除
  assert.match(del.failed[3].error, /缺少需求 ID/);
  assert.equal(data.listRequirements(pid, {}).total, 2, "r1/r2 已完成不可删，应保留");

  // 8. 已完成批量流转为已取消后可删（三态自由切换 + 交付记录保留语义）
  const reopen = data.updateRequirementStatuses(pid, [
    { id: r1.id, status: "已取消" },
    { id: r2.id, status: "已取消" },
  ]);
  assert.equal(reopen.success.length, 2);
  const del2 = data.deleteRequirements(pid, [r1.id, r2.id]);
  assert.equal(del2.success.length, 2);
  assert.equal(data.listRequirements(pid, {}).total, 0);

  // 7. 批量删除：空列表 / 超 50 拒绝
  assert.throws(() => data.deleteRequirements(pid, []), /不能为空/);
  assert.throws(() => data.deleteRequirements(pid, Array.from({ length: 51 }, () => "x")), /50/);
});
