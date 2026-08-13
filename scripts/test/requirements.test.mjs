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
