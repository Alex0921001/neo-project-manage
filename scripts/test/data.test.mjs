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
