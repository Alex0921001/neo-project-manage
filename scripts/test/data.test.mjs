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
