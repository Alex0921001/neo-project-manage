/**
 * 冒烟：拦截规则工具层实测（本地最新代码 + 临时库）
 * 1. 未确认便利贴 → 任务不能完成
 * 2. 非已采纳方案 → 任务不能关联；已采纳 → 可关联
 * 3. 子任务未完成 → 父任务不能完成
 * 4. 删任务 → 方案 task_id 置空 → 可再次转任务
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDataAccess } from "../lib/data.js";

const dir = mkdtempSync(join(tmpdir(), "smoke-intercept-"));
const data = createDataAccess(dir);

const results = [];
// expectThrow：期望抛错（拦截场景），抛错 = 通过；expectOk：期望成功，无错 = 通过
function checkThrow(name, fn, pattern) {
  try {
    fn();
    results.push({ name, pass: false, error: "应当被拦截，但未抛错" });
  } catch (e) {
    const hit = !pattern || pattern.test(String(e.message));
    results.push({ name, pass: hit, error: hit ? undefined : `错误信息不符：${e.message}` });
  }
}
function checkOk(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
  }
}

// ===== 1. 未确认便利贴 → 任务不能完成 =====
{
  const proj = data.createProject({ name: "拦截-项目1" });
  const task = data.createTask(proj.id, { name: "有便利贴的任务" });
  data.createAnnotation(proj.id, task.id, { content: "未确认便利贴" });
  checkThrow("1a. 未确认便利贴 → 任务完成被拦截", () => data.updateTask(proj.id, task.id, { done: true }), /便利贴未确认/);
  // 确认后再完成
  data.updateAnnotation(task.id, data.getTaskById(task.id).annotations[0].id, { confirmed: true });
  checkOk("1b. 便利贴确认后 → 任务可完成", () => { data.updateTask(proj.id, task.id, { done: true }); });
}

// ===== 2. 非已采纳方案 → 任务不能关联；已采纳 → 可关联 =====
{
  const proj = data.createProject({ name: "拦截-项目2" });
  const draft = data.createPlan(proj.id, "草稿方案", "");
  checkThrow("2a. 关联草稿方案被拦截", () => data.createTask(proj.id, { name: "T-草稿", planIds: [draft.id] }), /已采纳/);
  const adopted = data.createPlan(proj.id, "已采纳方案", "");
  data.updatePlan(proj.id, adopted.id, { status: "已采纳" });
  const t2 = data.createTask(proj.id, { name: "T-已采纳", planIds: [adopted.id] });
  checkOk("2b. 关联已采纳方案成功", () => {
    const refs = data.getTaskById(t2.id).planRefs;
    if (refs.length !== 1 || refs[0].id !== adopted.id) throw new Error(`planRefs=${JSON.stringify(refs)}`);
  });
  // updateTask 换关联到草稿 → 拦截
  checkThrow("2c. updateTask 换成草稿方案被拦截", () => data.updateTask(proj.id, t2.id, { planIds: [draft.id] }), /已采纳/);
}

// ===== 3. 子任务未完成 → 父任务不能完成 =====
{
  const proj = data.createProject({ name: "拦截-项目3" });
  const parent = data.createTask(proj.id, { name: "父任务" });
  data.createTask(proj.id, { name: "子任务", parentTaskId: parent.id });
  checkThrow("3a. 子任务未完成 → 父任务完成被拦截", () => data.updateTask(proj.id, parent.id, { done: true }), /子任务未完成/);
}

// ===== 4. 删任务 → 方案 task_id 置空 → 可再次转任务 =====
{
  const proj = data.createProject({ name: "拦截-项目4" });
  const plan = data.createPlan(proj.id, "可转方案", "");
  data.updatePlan(proj.id, plan.id, { status: "已采纳" });
  const conv = data.convertPlanToTask(proj.id, plan.id);
  checkThrow("4a. 已转任务后再次转换被拦截", () => data.convertPlanToTask(proj.id, plan.id), /不能重复转换/);
  data.deleteTask(proj.id, conv.taskId);
  const after = data.getPlan(proj.id, plan.id);
  checkOk("4b. 删任务后方案 task_id 置空（taskExists=false）", () => {
    if (after.taskExists) throw new Error(`taskExists=${after.taskExists}`);
  });
  const conv2 = data.convertPlanToTask(proj.id, plan.id);
  checkOk("4c. 删任务后可再次转任务", () => {
    if (!conv2.taskId) throw new Error("转换未返回 taskId");
  });
}

try { data._db?.close?.(); } catch {}
rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

let pass = 0, fail = 0;
for (const r of results) {
  if (r.pass) { pass++; console.log(`✅ ${r.name}${r.detail !== "ok" ? `（${r.detail}）` : ""}`); }
  else { fail++; console.log(`❌ ${r.name}：${r.error}`); }
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
