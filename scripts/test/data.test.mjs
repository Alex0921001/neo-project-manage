/**
 * neo-project-manage 数据层回归测试（node:test）
 *
 * 用法：node --test scripts/test/
 * 说明：使用临时数据库目录（os.tmpdir()），不触碰 dev/正式数据；跑完自动清理。
 * 覆盖：项目集 / 项目 / 任务树 / 成员契约 / 日期边界 / 批量事务 / 批注 / sanitize / 搜索 / 日历任务
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

// ===== 临时库 =====
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-test-"));
let data;

before(() => {
  data = createDataAccess(tmpDir);
});
after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ===== 工具 =====
function expectThrow(fn, pattern) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof Error, "应抛 Error");
    if (pattern) {
      assert.match(String(err.message), pattern, `错误信息应匹配 ${pattern}，实际: ${err.message}`);
    }
    return true;
  });
}

// ===== 1. 项目集 =====
test("项目集：创建 / 重名拒绝 / 超长拒绝 / 更新 / 删除", () => {
  const set = data.createProjectSet({ name: "测试集" });
  assert.ok(set.id, "应返回 id");
  assert.equal(set.name, "测试集");

  expectThrow(() => data.createProjectSet({ name: "测试集" }), /已存在/);
  expectThrow(() => data.createProjectSet({ name: "超长项目集名称超十个字符" }), /10/);
  expectThrow(() => data.createProjectSet({ name: "  " }), /不能为空/);

  const updated = data.updateProjectSet(set.id, { name: "改名集" });
  assert.equal(updated.name, "改名集");

  // 集下有项目时不能删
  data.createProject({ name: "集内项目", projectSetId: set.id });
  expectThrow(() => data.deleteProjectSet(set.id), /还有项目/);
});

// ===== 2. 项目 =====
test("项目：CRUD + 参数校验", () => {
  const p = data.createProject({
    name: "测试项目",
    description: "<p>富文本</p>",
    members: ["张三", "李四"],
    planStart: "2026-08-01",
    planEnd: "2026-08-31",
    status: "进行中",
  });
  assert.ok(p.id);
  assert.deepEqual(p.members, ["张三", "李四"]);

  // 名称校验
  expectThrow(() => data.createProject({ name: "" }), /不能为空/);
  expectThrow(() => data.createProject({ name: "一二三四五六七八九十一二三四五六七八九十X" }), /20/);

  // 非法状态
  expectThrow(() => data.createProject({ name: "X", status: "乱写" }), /status|状态/);

  // 非法日期
  expectThrow(() => data.createProject({ name: "X", planStart: "2026/08/01" }), /日期/);

  // 结束早于开始
  expectThrow(() => data.createProject({ name: "X", planStart: "2026-08-10", planEnd: "2026-08-01" }), /结束|早于/);

  // 更新
  const up = data.updateProject(p.id, { name: "改名项目", status: "已完成" });
  assert.equal(up.name, "改名项目");
  assert.equal(up.status, "已完成");

  // 查询
  const got = data.getProject(p.id);
  assert.ok(got);
  assert.equal(got.name, "改名项目");

  // 删除
  data.deleteProject(p.id);
  assert.equal(data.getProject(p.id), null);
});

// ===== 2b. 收藏（V2.0 P0-1） =====
test("收藏：创建默认 0 / update 可设 1 / 查询返回 pinned", () => {
  const p = data.createProject({ name: "收藏项目" });
  assert.equal(p.pinned, 0, "创建默认 pinned=0");

  const up = data.updateProject(p.id, { pinned: true });
  assert.equal(up.pinned, true, "update 可设 pinned=1");

  const listed = data.listProjects().find((x) => x.id === p.id);
  assert.equal(listed.pinned, true, "listProjects 返回 pinned");

  const got = data.getProject(p.id);
  assert.equal(got.pinned, true, "getProject 返回 pinned");

  // 取消收藏
  const off = data.updateProject(p.id, { pinned: false });
  assert.equal(off.pinned, false, "update 可取消收藏");
});

// ===== 3. 任务树 =====
test("任务：父子孙树 / 成员契约 / 日期边界 / 级联删除", () => {
  const p = data.createProject({
    name: "树项目",
    members: ["张三", "李四"],
    planStart: "2026-08-01",
    planEnd: "2026-08-31",
  });

  const t1 = data.createTask(p.id, { name: "顶层任务", assignees: ["张三"], startDate: "2026-08-05", endDate: "2026-08-10" });
  assert.ok(t1.id);
  assert.deepEqual(t1.assignees, ["张三"]);

  // 非法成员拒绝
  expectThrow(() => data.createTask(p.id, { name: "坏任务", assignees: ["王五"] }), /成员/);

  // end < start 拒绝
  expectThrow(() => data.createTask(p.id, { name: "X", startDate: "2026-08-10", endDate: "2026-08-05" }), /结束|早于/);

  // 日期越界项目周期：软提示（不抛错，warnings 记录）
  const out = data.createTask(p.id, { name: "越界任务", startDate: "2026-07-01" });
  assert.ok(Array.isArray(out.warnings) && out.warnings.length > 0, "越界应产生警告");

  // 子任务
  const sub = data.createTask(p.id, { name: "子任务", parentTaskId: t1.id });
  assert.equal(sub.parent_task_id, t1.id, "子任务挂到父任务");

  // 孙任务
  const grand = data.createTask(p.id, { name: "孙任务", parentTaskId: sub.id });
  assert.equal(grand.parent_task_id, sub.id, "孙任务挂到子任务");

  // 父任务不存在拒绝
  expectThrow(() => data.createTask(p.id, { name: "X", parentTaskId: "nonexist" }), /父任务/);

  // 列表 + 父子关系（buildTaskTree 为内部函数，用原始 parent_task_id 断言）
  const tasks = data.listTasks(p.id);
  assert.ok(tasks.some((x) => x.id === t1.id));
  assert.equal(tasks.find((x) => x.id === sub.id)?.parent_task_id, t1.id, "子任务父级正确");
  assert.equal(tasks.find((x) => x.id === grand.id)?.parent_task_id, sub.id, "孙任务父级正确");

  // 更新任务
  const up = data.updateTask(p.id, t1.id, { name: "改名任务", done: true });
  assert.equal(up.name, "改名任务");

  // 删除顶层任务 → 级联删除子/孙
  data.deleteTask(p.id, t1.id);
  const after = data.listTasks(p.id);
  assert.ok(!after.some((t) => t.id === t1.id || t.id === sub.id || t.id === grand.id), "级联删除子孙");
});

// ===== 3b. 任务优先级（V2.0） =====
test("任务优先级：默认 P3 / update 可改 / 非法抛错", () => {
  const p = data.createProject({ name: "优先级项目" });

  // 默认 P3
  const t1 = data.createTask(p.id, { name: "默认任务" });
  assert.equal(t1.priority, "P3", "创建默认 P3");

  // 显式设置
  const t2 = data.createTask(p.id, { name: "紧急任务", priority: "P0" });
  assert.equal(t2.priority, "P0", "创建可指定 P0");

  // update 可改优先级
  const up = data.updateTask(p.id, t1.id, { priority: "P1" });
  assert.equal(up.priority, "P1", "update 可改优先级");
  const got = data.getTaskById(t1.id);
  assert.equal(got.priority, "P1", "改后读回正确");

  // 非法 priority 抛错（create / update 双路径）
  expectThrow(() => data.createTask(p.id, { name: "坏任务", priority: "P9" }), /P0~P5/);
  expectThrow(() => data.createTask(p.id, { name: "坏任务2", priority: "p2" }), /P0~P5/);
  expectThrow(() => data.updateTask(p.id, t1.id, { priority: "P8" }), /P0~P5/);

  // createTasks 批量透传
  const batch = data.createTasks(p.id, [{ name: "批A", priority: "P4" }, { name: "批B" }]);
  assert.equal(batch[0].priority, "P4");
  assert.equal(batch[1].priority, "P3", "批量默认 P3");
});

// ===== 3c. listTasks 排序（V2.0） =====
test("listTasks 排序：等级 → 开始时间 → 创建时间", () => {
  const p = data.createProject({ name: "排序项目" });
  data.createTask(p.id, { name: "P0", priority: "P0" });
  data.createTask(p.id, { name: "P2晚", priority: "P2", startDate: "2026-08-10" });
  data.createTask(p.id, { name: "P2早", priority: "P2", startDate: "2026-08-02" });
  data.createTask(p.id, { name: "P2无日期", priority: "P2" });
  data.createTask(p.id, { name: "P1", priority: "P1" });
  data.createTask(p.id, { name: "P3先", priority: "P3" });
  data.createTask(p.id, { name: "P3后", priority: "P3" });

  const names = data.listTasks(p.id).map((t) => t.name);
  // 等级优先：P0 → P1 → P2 → P3
  assert.deepEqual(names.slice(0, 2), ["P0", "P1"], "P0/P1 等级在前");
  // 同等级按开始时间（有日期在前，按日期升序），无日期排最后
  assert.deepEqual(names.slice(2, 5), ["P2早", "P2晚", "P2无日期"], "同等级按开始时间，无日期垫底");
  // 同等级同无日期：按创建时间（先创建在前；稳定排序下即使同毫秒也保持插入序）
  assert.deepEqual(names.slice(5), ["P3先", "P3后"], "无日期同等级按创建时间");
});

// ===== 3d. 任务里程碑（V2.1） =====
test("任务里程碑：默认 false / 显式设置 / update 切换 / 非法抛错", () => {
  const p = data.createProject({ name: "里程碑项目", planStart: "2026-08-01", planEnd: "2026-08-31" });

  // 默认 false
  const t1 = data.createTask(p.id, { name: "普通任务" });
  assert.equal(t1.isMilestone, false, "创建默认 isMilestone=false");

  // 显式 true
  const t2 = data.createTask(p.id, { name: "里程碑任务", isMilestone: true, startDate: "2026-08-10" });
  assert.equal(t2.isMilestone, true, "创建可指定 isMilestone=true");

  // 0/1 数字归一化
  const t3 = data.createTask(p.id, { name: "数字1任务", isMilestone: 1 });
  assert.equal(t3.isMilestone, true, "isMilestone=1 归一化为 true");
  const t4 = data.createTask(p.id, { name: "数字0任务", isMilestone: 0 });
  assert.equal(t4.isMilestone, false, "isMilestone=0 归一化为 false");

  // update 可切换
  const up = data.updateTask(p.id, t1.id, { isMilestone: true });
  assert.equal(up.isMilestone, true, "update 可设里程碑");
  const off = data.updateTask(p.id, t1.id, { isMilestone: false });
  assert.equal(off.isMilestone, false, "update 可取消里程碑");

  // 读回（getTaskById / listTasks / getProjectTasks 三条路径）
  const got = data.getTaskById(t2.id);
  assert.equal(got.isMilestone, true, "getTaskById 返回 isMilestone");
  const listed = data.listTasks(p.id).find((x) => x.id === t2.id);
  assert.equal(listed.isMilestone, true, "listTasks 返回 isMilestone");
  const proj = data.getProject(p.id);
  const treeHit = (list) => list.some((t) => t.id === t2.id ? t.isMilestone : (t.subtasks || []).some((s) => s.id === t2.id && s.isMilestone));
  assert.ok(treeHit(proj.tasks), "getProject 树形任务返回 isMilestone");

  // 非法值抛错（create / update 双路径）
  expectThrow(() => data.createTask(p.id, { name: "坏任务", isMilestone: "yes" }), /布尔/);
  expectThrow(() => data.updateTask(p.id, t1.id, { isMilestone: "true" }), /布尔/);

  // createTasks 批量透传
  const batch = data.createTasks(p.id, [{ name: "批里程碑", isMilestone: true }, { name: "批普通" }]);
  assert.equal(batch[0].isMilestone, true);
  assert.equal(batch[1].isMilestone, false, "批量默认 false");
});

// ===== 4. 批量创建 + 事务回滚 =====
test("createTasks：批量 + 中途失败整体回滚", () => {
  const p = data.createProject({ name: "批量项目", members: ["张三"] });

  const items = [
    { name: "任务A" },
    { name: "任务B", assignees: ["张三"] },
    { name: "任务C" },
  ];
  const created = data.createTasks(p.id, items);
  assert.equal(created.length, 3);

  // 超 50 拒绝
  const many = Array.from({ length: 51 }, (_, i) => ({ name: `任务${i}` }));
  expectThrow(() => data.createTasks(p.id, many), /50/);

  // 缺名拒绝
  expectThrow(() => data.createTasks(p.id, [{ name: "ok" }, { name: "" }]), /名称/);

  // 事务回滚：第 2 条非法成员 → 整体回滚（第 1 条也不应存在）
  const beforeCount = data.listTasks(p.id).length;
  expectThrow(() => data.createTasks(p.id, [{ name: "回滚A" }, { name: "回滚B", assignees: ["不存在"] }]), /成员/);
  const afterCount = data.listTasks(p.id).length;
  assert.equal(afterCount, beforeCount, "失败后无残留");
});

// ===== 5. 批注 =====
test("批注：单条/批量/更新确认/删除 + 跨项目校验", () => {
  const p = data.createProject({ name: "批注项目" });
  const t = data.createTask(p.id, { name: "批注任务" });

  const a1 = data.createAnnotation(p.id, t.id, { content: "<p>第一条</p>" });
  assert.ok(a1.id);

  const many = data.createAnnotations(p.id, t.id, [{ content: "批量1" }, { content: "批量2" }]);
  assert.equal(many.length, 2);

  // 跨项目校验
  const p2 = data.createProject({ name: "另一个项目" });
  expectThrow(() => data.createAnnotation(p2.id, t.id, { content: "跨项目" }), /不存在|属于/);

  // 更新 + 确认
  const up = data.updateAnnotation(t.id, a1.id, { content: "改后内容", confirmed: true });
  assert.equal(up.confirmed, true);

  // 空内容拒绝
  expectThrow(() => data.updateAnnotation(t.id, a1.id, { content: "   " }), /不能为空/);

  // 删除（签名：projectId, taskId, annId）
  data.deleteAnnotation(p.id, t.id, a1.id);
  const list = data.getTaskAnnotations(t.id);
  assert.ok(!list.some((a) => a.id === a1.id));
});

// ===== 6. sanitize =====
test("sanitize：XSS 剥离 / img data: 保留 / 事件属性剔除", () => {
  const p = data.createProject({ name: "清洗项目" });
  const t = data.createTask(p.id, { name: "清洗任务" });

  const ann = data.createAnnotation(p.id, t.id, {
    content: `<p onclick="alert(1)">安全文本<script>alert(2)</script></p><img src="data:image/png;base64,iVBORw0KGgo=">`,
  });
  assert.ok(!ann.content.includes("<script"), "script 应被剥离");
  assert.ok(!ann.content.includes("onclick"), "事件属性应被剥离");
  assert.ok(ann.content.includes('src="data:image/png;base64,'), "data:image 应保留");
  assert.ok(ann.content.includes("安全文本"), "文本应保留");
});

// ===== 7. 搜索 =====
test("listTasks keyword：命中任务名/描述/批注内容", () => {
  const p = data.createProject({ name: "搜索项目" });
  const t = data.createTask(p.id, { name: "登录模块", description: "<p>实现登录</p>" });
  data.createTask(p.id, { name: "注册模块" });
  data.createAnnotation(p.id, t.id, { content: "含有关键词：token 校验" });

  const hit1 = data.listTasks(p.id, { keyword: "登录" });
  assert.ok(hit1.some((x) => x.id === t.id), "任务名命中");

  const hit2 = data.listTasks(p.id, { keyword: "token" });
  assert.ok(hit2.some((x) => x.id === t.id), "批注内容命中");
});

// ===== 8. 日历任务 =====
test("listCalendarTasks：仅返回有起止日期的任务", () => {
  const p = data.createProject({ name: "日历项目" });
  data.createTask(p.id, { name: "有日期", startDate: "2026-08-05", endDate: "2026-08-10" });
  data.createTask(p.id, { name: "无日期" });

  const cal = data.listCalendarTasks("undone", p.id);
  assert.ok(cal.every((t) => t.startDate && t.endDate), "都应有日期");
  assert.ok(cal.some((t) => t.name === "有日期"));
  assert.ok(!cal.some((t) => t.name === "无日期"));
});

// ===== 8b. 日历任务：里程碑标记透传（V2.1） =====
test("listCalendarTasks：isMilestone 透传", () => {
  const p = data.createProject({ name: "日历里程碑项目" });
  data.createTask(p.id, { name: "里程碑", startDate: "2026-08-05", endDate: "2026-08-10", isMilestone: true });
  const cal = data.listCalendarTasks("undone", p.id);
  assert.ok(cal.some((t) => t.name === "里程碑" && t.isMilestone === true), "日历任务应带 isMilestone");
});

// ===== 9. 项目统计 =====
test("项目统计：taskCount / incompleteTaskCount", () => {
  const p = data.createProject({ name: "统计项目" });
  data.createTask(p.id, { name: "未完成" });
  const done = data.createTask(p.id, { name: "已完成" });
  data.updateTask(p.id, done.id, { done: true });

  const proj = data.listProjects().find((x) => x.id === p.id);
  assert.equal(proj.taskCount, 2);
  assert.equal(proj.incompleteTaskCount, 1);
});

// ===== 10. 批注 kind（V2.0） =====
test("批注 kind：创建/筛选/老数据兜底/非法值拦截", () => {
  const p = data.createProject({ name: "kind项目" });
  const t = data.createTask(p.id, { name: "kind任务" });

  const n = data.createAnnotation(p.id, t.id, { content: "备注" });
  const d = data.createAnnotation(p.id, t.id, { content: "决策", kind: "decision" });
  const r = data.createAnnotation(p.id, t.id, { content: "风险", kind: "risk" });
  assert.equal(n.kind, "note");
  assert.equal(d.kind, "decision");
  assert.equal(r.kind, "risk");

  // 老数据：库内 NULL → 读取 note
  data.createAnnotation(p.id, t.id, { content: "x" });
  // 筛选（note = 显式 note 1 条 + 老数据兜底 1 条 = 2）
  assert.equal(data.getTaskAnnotations(t.id, "decision").length, 1);
  assert.equal(data.getTaskAnnotations(t.id, "note").length, 2);
  // 非法
  expectThrow(() => data.createAnnotation(p.id, t.id, { content: "x", kind: "bad" }), /kind/);
});

// ===== 11. 文件资产化（V2.0） =====
test("文件资产化：登记读元信息 / digest / 路径失效防御", () => {
  const p = data.createProject({ name: "文件项目" });
  const real = path.join(tmpDir, "REPORT.PDF");
  fs.writeFileSync(real, Buffer.alloc(1200));
  const f = data.addFile(p.id, real, "摘要");
  assert.equal(f.size, 1200);
  assert.equal(f.ext, "pdf");
  assert.equal(f.digest, "摘要");
  assert.equal(f.indexed, 0);
  // 不存在路径
  const bad = data.addFile(p.id, path.join(tmpDir, "missing.pdf"));
  assert.equal(bad.size, null);
  // digest 超长截断
  const long = data.addFile(p.id, real, "a".repeat(600));
  assert.equal(long.digest.length, 500);
  // getProject 带新字段
  const proj = data.getProject(p.id);
  assert.ok(proj.files.every((x) => "size" in x && "ext" in x && "digest" in x));
});

// ===== 12. 会话关联（V2.0） =====
test("会话关联：link 去重 / unlink / 脏数据兜底", () => {
  const p = data.createProject({ name: "会话项目" });
  data.linkProjectSession(p.id, "sess-1");
  data.linkProjectSession(p.id, "sess-1");
  data.linkProjectSession(p.id, "sess-2");
  assert.equal(data.listProjectSessions(p.id).length, 2);
  data.unlinkProjectSession(p.id, "sess-1");
  assert.equal(data.listProjectSessions(p.id).length, 1);
  // 非法 sessionId
  expectThrow(() => data.linkProjectSession(p.id, "a".repeat(129)), /128/);
  expectThrow(() => data.linkProjectSession(p.id, "bad 空格"), /sessionId/);
  // 项目不存在
  expectThrow(() => data.linkProjectSession("no", "s"), /不存在/);
});

// ===== 13. 总结持久化 + 风险识别（V2.0） =====
test("总结：保存/查询/50KB 上限 + 风险规则触发", () => {
  const p = data.createProject({ name: "总结项目", status: "进行中", planStart: "2026-01-01", planEnd: "2026-12-31" });
  data.saveProjectSummary(p.id, '{"summary":"正常"}', "auto");
  data.saveProjectSummary(p.id, "{\"summary\":\"正常2\"}", "manual");
  assert.equal(data.getProjectSummaries(p.id).length, 2);
  assert.equal(data.getProjectSummaries(p.id, 1).length, 1);
  // 50KB 上限
  expectThrow(() => data.saveProjectSummary(p.id, JSON.stringify({ summary: "a".repeat(60000) })), /50KB/);
  // 风险：延期任务（endDate 在过去）
  const t = data.createTask(p.id, { name: "延期任务", endDate: "2026-01-01" });
  const s = data.summarizeProject(p.id);
  assert.ok(s.risks.some((r) => r.level === "high" && r.desc.includes("延期")), "应识别延期 high 风险");
  assert.ok(s.delayed.length >= 1, "delayed 应有延期任务");
  assert.ok(s.project.progress >= 0 && s.project.progress <= 100, "progress 在 0-100");
  assert.ok(s.nextSteps.length > 0, "nextSteps 非空");
  // 空项目
  const empty = data.createProject({ name: "空总结项目" });
  const se = data.summarizeProject(empty.id);
  assert.equal(se.project.progress, 0);
  assert.equal(se.completed.length, 0);
  // 已取消：nextSteps 提示可重启，风险仍保留（规则不受影响）
  const cancelled = data.createProject({ name: "已取消项目", status: "已取消" });
  data.createTask(cancelled.id, { name: "取消任务", endDate: "2026-01-01" });
  const sc = data.summarizeProject(cancelled.id);
  assert.ok(sc.nextSteps.some((n) => n.includes("重启")), "已取消项目应提示可重启");
  assert.equal(sc.nextSteps.length, 1, "已取消项目只输出一条重启提示");
  assert.ok(sc.project.status === "已取消", "已取消状态应透传");
  // 已归档：nextSteps 为空（前端走撒花缺省态），project.archived 标记透传
  const archived = data.createProject({ name: "归档项目", status: "已完成" });
  data.updateProject(archived.id, { archived: true });
  const sa = data.summarizeProject(archived.id);
  assert.equal(sa.nextSteps.length, 0, "已归档项目 nextSteps 应为空");
  assert.equal(sa.project.archived, true, "archived 标记应透传");
});

// ===== 13b. risk 批注纳入风险统计（V2.1 3.2） =====
test("风险：risk 批注纳入 summarize 风险列表（未确认 medium / 已确认 high / 无则不产生）", () => {
  const p = data.createProject({ name: "风险批注项目" });
  const t = data.createTask(p.id, { name: "风险任务" });

  // 未确认 risk 批注 → medium
  data.createAnnotation(p.id, t.id, { content: "数据库性能隐患，需要尽快评估", kind: "risk" });
  const s1 = data.summarizeProject(p.id);
  const hit1 = s1.risks.find((r) => r.kind === "risk" && r.tasks?.[0]?.id === t.id);
  assert.ok(hit1, "未确认 risk 批注应生成风险项");
  assert.equal(hit1.level, "medium", "未确认应为 medium");
  assert.equal(hit1.confirmed, false, "应透传未确认态");
  assert.ok(hit1.desc.startsWith("风险批注："), "desc 应带风险批注前缀");
  assert.ok(hit1.desc.includes("风险任务"), "desc 应含挂载任务名");
  const anns1 = data.getTaskAnnotations(t.id);
  assert.equal(anns1.length, 1, "应只有一条批注");
  assert.deepEqual(hit1.tasks, [{ id: t.id, name: t.name, annotationId: anns1[0].id }], "tasks 应含挂载任务 + 批注 id（供定位高亮）");

  // 确认后 → high
  data.updateAnnotation(t.id, anns1[0].id, { confirmed: true });
  const s2 = data.summarizeProject(p.id);
  const hit2 = s2.risks.find((r) => r.kind === "risk");
  assert.equal(hit2.level, "high", "已确认应为 high");
  assert.equal(hit2.confirmed, true, "应透传确认态");

  // 排序保持 high → medium → low（批注风险项也遵守）
  const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < s2.risks.length; i++) {
    assert.ok(
      LEVEL_ORDER[s2.risks[i - 1].level] <= LEVEL_ORDER[s2.risks[i].level],
      `risks 应按 high→medium→low 排序（第 ${i} 项失序）`
    );
  }

  // 无 risk 批注的项目不受影响
  const p2 = data.createProject({ name: "无风险批注项目" });
  const t2 = data.createTask(p2.id, { name: "普通任务" });
  data.createAnnotation(p2.id, t2.id, { content: "普通备注" });
  const s3 = data.summarizeProject(p2.id);
  assert.ok(!s3.risks.some((r) => r.kind === "risk"), "无 risk 批注不应产生批注风险项");
});

// ===== 14. askProject（V2.0） =====
test("askProject：scope 齐全 / decisions 过滤 / all 四段", () => {
  const p = data.createProject({ name: "ask项目" });
  const t = data.createTask(p.id, { name: "任务" });
  data.createAnnotation(p.id, t.id, { content: "决策A", kind: "decision" });
  data.createAnnotation(p.id, t.id, { content: "备注B", kind: "note" });
  data.createNote(p.id, { content: "备注1" });
  data.saveProjectSummary(p.id, "{\"summary\":\"进展\"}", "auto");

  const d = data.askProject(p.id, "decisions");
  assert.equal(d.decisions.length, 1);
  assert.equal(d.decisions[0].content, "决策A");
  const a = data.askProject(p.id, "all");
  assert.ok(a.summary && a.decisions && a.timeline && a.files, "all 四段齐全");
  assert.equal(a.risks, undefined, "all 不应含顶层 risks");
  expectThrow(() => data.askProject(p.id, "bad"), /scope/);
});

// ===== 15. 成员管理（V2.0） =====
test("成员：创建 / 重名拒绝 / 改名 / 删除", () => {
  const m = data.createMember("MEM-甲");
  assert.ok(m.id, "应返回 id");
  assert.equal(m.name, "MEM-甲");

  // trim + 空名校验
  const mTrim = data.createMember("  MEM-乙  ");
  assert.equal(mTrim.name, "MEM-乙", "应 trim 后入库");
  expectThrow(() => data.createMember("   "), /不能为空/);

  // 重名拒绝（含 trim 后重名）
  expectThrow(() => data.createMember("MEM-甲"), /成员.*已存在/);
  expectThrow(() => data.createMember(" MEM-乙 "), /成员.*已存在/);

  // listMembers 按 name 排序
  const names = data.listMembers().map((x) => x.name);
  assert.ok(names.includes("MEM-甲") && names.includes("MEM-乙"), "list 应包含新建成员");
  assert.deepEqual(names, [...names].sort(), "list 应按 name 排序");

  // 改名 + 改后重名拒绝（排除自身）
  const renamed = data.renameMember(m.id, "MEM-甲改");
  assert.equal(renamed.name, "MEM-甲改");
  // 改回同名：不视为重名，正常返回
  const same = data.renameMember(m.id, "MEM-甲改");
  assert.equal(same.name, "MEM-甲改", "改成同名应成功");
  expectThrow(() => data.renameMember(mTrim.id, "MEM-甲改"), /成员.*已存在/, "改名撞他人应拒绝");
  expectThrow(() => data.renameMember(m.id, "  "), /不能为空/);
  expectThrow(() => data.renameMember("no-such", "任意名"), /不存在/);

  // 删除 + 删不存在
  assert.equal(data.deleteMember(m.id), true);
  expectThrow(() => data.deleteMember(m.id), /不存在/);
  assert.ok(!data.listMembers().some((x) => x.id === m.id), "删除后不应再列出");
});

test("成员：allKnownNames 聚合（含历史项目里的成员名、去重）", () => {
  // 历史人名：只出现在项目/任务里，未录入全局 members 表
  const p = data.createProject({ name: "MEM-聚合项目", members: ["MEM-历史人甲", "MEM-历史人乙"] });
  data.createTask(p.id, { name: "MEM-聚合任务", assignees: ["MEM-历史人甲"] });
  // 全局成员
  data.createMember("MEM-全局人");

  const known = data.allKnownNames();
  assert.ok(Array.isArray(known) && known.length > 0, "应聚合出名字");
  // members 表 ∪ projects.members ∪ tasks.assignees
  assert.ok(known.includes("MEM-全局人"), "应含全局成员");
  assert.ok(known.includes("MEM-历史人甲"), "应含项目成员（历史）");
  assert.ok(known.includes("MEM-历史人乙"), "应含项目成员（历史）");
  // 去重：同名只出现一次
  assert.equal(known.filter((n) => n === "MEM-历史人甲").length, 1, "同名应去重");
  // 排序
  assert.deepEqual(known, [...known].sort((a, b) => a.localeCompare(b, "zh")), "应按名称排序");
});

// ===== 16. 审计日志（V2.1 审计追踪） =====
test("审计：写操作产生记录 / old-new 正确 / 读不产生 / 项目隔离 / 分页 / 级联删除", () => {
  const p = data.createProject({ name: "审计项目", members: ["审计人甲"], status: "待开始" });
  const p2 = data.createProject({ name: "审计项目2" });
  const pid = p.id;

  // —— 创建项目 ——
  let logs = data.listAuditLogs(pid);
  assert.equal(logs.items.length, 1, "建项目应产生 1 条审计");
  assert.equal(logs.items[0].action, "创建项目");
  assert.equal(logs.items[0].targetType, "project");
  assert.equal(logs.items[0].targetId, pid);
  assert.equal(logs.items[0].oldValue, null, "创建无旧值");
  const createdNew = JSON.parse(logs.items[0].newValue);
  assert.equal(createdNew.name, "审计项目");
  assert.equal(createdNew.status, "待开始");
  assert.deepEqual(createdNew.members, ["审计人甲"]);

  // —— 改状态：old/new 正确 ——
  data.updateProject(pid, { status: "进行中" });
  logs = data.listAuditLogs(pid);
  // 注：多条操作可能同毫秒（created_at 相同），断言按动作+内容匹配，不依赖 items[0] 顺序
  const statusLog = logs.items.find((x) => x.action === "更新项目" && JSON.parse(x.oldValue).status === "待开始");
  assert.ok(statusLog, "改状态应产生更新项目记录");
  assert.equal(JSON.parse(statusLog.newValue).status, "进行中");

  // —— 改成员 ——
  data.updateProject(pid, { members: ["审计人甲", "审计人乙"] });
  logs = data.listAuditLogs(pid);
  const memberLog = logs.items.find((x) => x.action === "更新项目" && Array.isArray(JSON.parse(x.oldValue).members));
  assert.ok(memberLog, "改成员应产生更新项目记录");
  assert.deepEqual(JSON.parse(memberLog.oldValue).members, ["审计人甲"]);
  assert.deepEqual(JSON.parse(memberLog.newValue).members, ["审计人甲", "审计人乙"]);

  // —— 归档 / 恢复归档：动作特判 ——
  data.updateProject(pid, { archived: true });
  logs = data.listAuditLogs(pid);
  const archLog = logs.items.find((x) => x.action === "归档项目");
  assert.ok(archLog, "归档应产生归档项目记录");
  assert.equal(JSON.parse(archLog.oldValue).archived, false);
  assert.equal(JSON.parse(archLog.newValue).archived, true);
  data.updateProject(pid, { archived: false });
  logs = data.listAuditLogs(pid);
  assert.ok(logs.items.find((x) => x.action === "恢复归档"), "取消归档应产生恢复归档记录");

  // —— 任务：创建 / 更新（含 done 归一 bool）——
  const t = data.createTask(pid, { name: "审计任务", assignees: ["审计人甲"] });
  // 批注需在任务未完成时挂载（V2.1 规则：已完成任务不允许挂载便利贴）
  const a = data.createAnnotation(pid, t.id, { content: "审计批注A", kind: "note" });
  // V2.1 规则：完成任务前便利贴必须全部确认（顺带验证 kind+confirmed 变更审计）
  data.updateAnnotation(t.id, a.id, { kind: "risk", confirmed: true });
  data.updateTask(pid, t.id, { name: "审计任务改", done: true });
  logs = data.listAuditLogs(pid);
  const taskLog = logs.items.find((x) => x.action === "更新任务" && x.targetId === t.id);
  assert.ok(taskLog, "更新任务应产生记录");
  const taskOld = JSON.parse(taskLog.oldValue);
  const taskNew = JSON.parse(taskLog.newValue);
  assert.equal(taskOld.name, "审计任务");
  assert.equal(taskOld.done, false, "done 旧值应为 bool false");
  assert.equal(taskNew.done, true, "done 新值应为 bool true");

  // —— 批注：删除（kind/confirmed 变更已在上方验证）——
  data.deleteAnnotation(pid, t.id, a.id);
  logs = data.listAuditLogs(pid);
  const delAnnLog = logs.items.find((x) => x.action === "删除批注" && x.targetId === a.id);
  assert.ok(delAnnLog, "删除批注应产生记录");
  assert.ok(JSON.parse(delAnnLog.oldValue).content.includes("审计批注A"), "删除应留旧值");
  assert.equal(delAnnLog.newValue, null);

  // —— 读操作不产生记录 ——
  const beforeRead = data.listAuditLogs(pid).total;
  data.getProject(pid);
  data.listProjects();
  data.listTasks(pid);
  data.getTaskById(t.id);
  data.getTaskAnnotations(t.id);
  assert.equal(data.listAuditLogs(pid).total, beforeRead, "读操作不应产生审计");

  // —— 项目隔离：p2 只有自己的创建记录 ——
  const logs2 = data.listAuditLogs(p2.id);
  assert.equal(logs2.total, 1, "p2 应只有 1 条（创建项目）");
  assert.equal(logs2.items[0].targetId, p2.id, "不应看到其他项目的记录");

  // —— 分页：limit / offset / total ——
  const all = data.listAuditLogs(pid, { limit: 200 });
  assert.ok(all.total > 3, `应有多条审计（实际 ${all.total}）`);
  assert.equal(all.items.length, all.total, "limit 200 应取全");
  const page1 = data.listAuditLogs(pid, { limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.total, all.total, "total 不受 limit 影响");
  const page2 = data.listAuditLogs(pid, { limit: 2, offset: 2 });
  assert.equal(page2.items[0].id, all.items[2].id, "offset 分页应与全量顺序一致");
  // limit 上限 200
  assert.equal(data.listAuditLogs(pid, { limit: 999 }).items.length, all.total, "limit 超 200 应封顶");

  // —— 筛选：action 精确 / keyword 模糊 ——
  assert.equal(data.listAuditLogs(pid, { action: "删除批注" }).total, 1);
  assert.ok(data.listAuditLogs(pid, { keyword: "审计任务改" }).total >= 1, "keyword 应命中任务名");
  assert.ok(data.listAuditLogs(pid, { keyword: "审计批注A" }).total >= 1, "keyword 应命中 old_value");

  // —— 全局操作（成员/项目集）不污染任何项目 ——
  data.createMember("审计全局成员");
  data.createProjectSet({ name: "审计全局集" });
  assert.equal(data.listAuditLogs(pid).total, all.total, "全局操作不应出现在项目审计中");

  // —— 删除项目：审计级联删除（直查表验证无孤儿）——
  data.deleteTask(pid, t.id); // 先删任务（含已完成任务阻止删除项目的业务规则）
  data.deleteProject(p2.id);
  const orphan = data._db.prepare("SELECT COUNT(*) as c FROM audit_logs WHERE project_id = ?").get(p2.id).c;
  assert.equal(orphan, 0, "删除项目后审计应级联删除");
  expectThrow(() => data.listAuditLogs(p2.id), /不存在/);
});

// ===== 17. 便利贴与任务完成互斥规则（V2.1） =====
test("便利贴规则：已完成任务禁挂载 / 禁修改冻结 / 完成前置需全部确认", () => {
  const p = data.createProject({ name: "规则项目" });
  const t = data.createTask(p.id, { name: "规则任务" });

  // 未完成任务：可挂载、可修改
  const a = data.createAnnotation(p.id, t.id, { content: "初始" });
  data.updateAnnotation(t.id, a.id, { content: "改后" });

  // 完成前置：有未确认便利贴时拒绝
  expectThrow(() => data.updateTask(p.id, t.id, { done: true }), /便利贴未确认/);

  // 确认后完成
  data.updateAnnotation(t.id, a.id, { confirmed: true });
  data.updateTask(p.id, t.id, { done: true });

  // 已完成任务：挂载被拒
  expectThrow(() => data.createAnnotation(p.id, t.id, { content: "新挂" }), /任务已完成/);
  expectThrow(() => data.createAnnotations(p.id, t.id, [{ content: "批量" }]), /任务已完成/);

  // 已完成任务：修改冻结（内容 / kind / confirmed 均拒绝）
  expectThrow(() => data.updateAnnotation(t.id, a.id, { content: "再改" }), /已冻结/);
  expectThrow(() => data.updateAnnotation(t.id, a.id, { kind: "risk" }), /已冻结/);
  expectThrow(() => data.updateAnnotation(t.id, a.id, { confirmed: false }), /已冻结/);

  // 已完成任务：删除不受限（下面在未完成任务上验证删除正常）
  const t2 = data.createTask(p.id, { name: "规则任务2" });
  const b = data.createAnnotation(p.id, t2.id, { content: "待删" });
  data.deleteAnnotation(p.id, t2.id, b.id);

  // 取消完成后再挂载：允许（流程放行，重新完成时仍要求全部确认）
  data.updateTask(p.id, t.id, { done: false });
  const c = data.createAnnotation(p.id, t.id, { content: "重新挂载" });
  data.updateAnnotation(t.id, c.id, { confirmed: true });
  data.updateTask(p.id, t.id, { done: true });
  const after = data.getTaskById(t.id);
  assert.equal(after.done, true, "重新完成应成功");
});

// ===== N. 方案管理（V2.1，plans + plan_comments + 转任务）=====
test("方案：CRUD + 状态校验 + 评论 + 转任务 + 审计联动", () => {
  const proj = data.createProject({ name: "方案测试项目" });

  // 创建（默认草稿）
  const p1 = data.createPlan(proj.id, "A 方案：技术选型", "<p>富文本内容</p>");
  assert.equal(p1.status, "草稿");
  assert.ok(p1.id, "应返回 id");
  expectThrow(() => data.createPlan(proj.id, "  "), /不能为空/);
  expectThrow(() => data.createPlan(proj.id, "超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题超长标题"), /100/);

  // 列表（含评论数 / 分页 / 标题搜索）
  const list = data.listPlans(proj.id);
  assert.equal(list.total, 1);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].commentCount, 0);
  // 搜索命中 / 未命中
  assert.equal(data.listPlans(proj.id, { keyword: "技术选型" }).total, 1);
  assert.equal(data.listPlans(proj.id, { keyword: "不存在的标题" }).total, 0);
  // 分页：offset 越界返回空 items
  const paged = data.listPlans(proj.id, { limit: 10, offset: 10 });
  assert.equal(paged.total, 1);
  assert.equal(paged.items.length, 0);

  // 更新标题 + 状态（4 态：草稿/进行中/已采纳/已废弃）
  const updated = data.updatePlan(proj.id, p1.id, { status: "进行中", title: "A 方案：技术选型 v2" });
  assert.equal(updated.status, "进行中");
  assert.equal(updated.title, "A 方案：技术选型 v2");
  expectThrow(() => data.updatePlan(proj.id, p1.id, { status: "非法状态" }), /非法/);
  data.updatePlan(proj.id, p1.id, { status: "已废弃" });
  assert.equal(data.getPlan(proj.id, p1.id).status, "已废弃");

  // 评论（任何状态可评）
  const c1 = data.addPlanComment(proj.id, p1.id, "建议优先验证兼容性");
  assert.ok(c1.id, "评论应返回 id");
  expectThrow(() => data.addPlanComment(proj.id, p1.id, "  "), /不能为空/);
  const detail = data.getPlan(proj.id, p1.id);
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.comments[0].content, "建议优先验证兼容性");

  // 一键转任务：仅已采纳可转；标题→任务名、内容→描述；不重复转
  expectThrow(() => data.convertPlanToTask(proj.id, p1.id), /已采纳/); // 已废弃状态不能转
  data.updatePlan(proj.id, p1.id, { status: "已采纳" });
  const conv = data.convertPlanToTask(proj.id, p1.id);
  assert.ok(conv.taskId, "应返回任务 id");
  expectThrow(() => data.convertPlanToTask(proj.id, p1.id), /已转为任务/);
  const after = data.getPlan(proj.id, p1.id);
  assert.equal(after.taskId, conv.taskId);
  assert.equal(after.taskExists, true);
  assert.ok(after.taskName, "应带任务名");
  const task = data.getTaskById(conv.taskId);
  assert.equal(task.name, "A 方案：技术选型 v2");
  assert.ok(task.description.includes("富文本内容"), "任务描述应含方案内容");

  // 状态业务校验（已采纳 + 已转任务 + 任务存在）：标题不可改、状态冻结、不可删
  expectThrow(() => data.updatePlan(proj.id, p1.id, { title: "改标题" }), /草稿/);
  expectThrow(() => data.updatePlan(proj.id, p1.id, { status: "草稿" }), /冻结/);
  expectThrow(() => data.deletePlan(proj.id, p1.id), /草稿/);

  // 删评论
  data.deletePlanComment(proj.id, p1.id, c1.id);
  assert.equal(data.getPlan(proj.id, p1.id).comments.length, 0);
  expectThrow(() => data.deletePlanComment(proj.id, p1.id, c1.id), /不存在/);

  // 任务删除后：状态冻结解除，可回退流转；回退到草稿后可删（级联删评论）
  data.deleteTask(proj.id, conv.taskId);
  assert.equal(data.getPlan(proj.id, p1.id).taskExists, false);
  data.updatePlan(proj.id, p1.id, { status: "草稿" }); // 悬空回退允许
  assert.equal(data.getPlan(proj.id, p1.id).status, "草稿");
  data.deletePlan(proj.id, p1.id);
  expectThrow(() => data.getPlan(proj.id, p1.id), /不存在/);

  // 审计联动：6 种动作全部留痕
  const audit = data.listAuditLogs(proj.id, {});
  const actions = audit.items.map((a) => a.action);
  for (const act of ["创建方案", "更新方案", "方案评论", "方案转任务", "删除方案评论", "删除方案"]) {
    assert.ok(actions.includes(act), `审计应包含 ${act}`);
  }
});
