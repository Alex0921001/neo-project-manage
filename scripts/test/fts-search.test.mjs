/**
 * neo-project-manage V2.3 R2 全文检索测试（node:test）
 *
 * 覆盖：FTS 增量（updateTask 改名后搜到新词 / deleteTask 后搜不到）、全类型索引
 * （task/annotation/plan/requirement/note/file）、type/projectId 过滤、LIKE 兜底（1~2 字词）、
 * 空 keyword、ensureFtsReady 首次全量。每个 test 独立临时库，跑完自动清理。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

/** 独立临时库（close 释放句柄后清理） */
function newData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-fts-"));
  const data = createDataAccess(dir);
  return {
    data,
    close: () => {
      try { data._db.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

test("FTS 增量：updateTask 改名后搜到新词、旧词消失；deleteTask 后搜不到", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "检索增量项目" });
    const t = data.createTask(p.id, { name: "初始名甲虫" });

    assert.equal(data.searchAll("甲虫").total, 1, "初始可搜");

    // 改名 → 增量重建后新词命中、旧词消失
    data.updateTask(p.id, t.id, { name: "新名羚羊" });
    assert.equal(data.searchAll("羚羊").total, 1, "改名后搜到新词");
    assert.equal(data.searchAll("甲虫").total, 0, "旧词不再命中");

    // 删除 → 搜不到
    data.deleteTask(p.id, t.id);
    assert.equal(data.searchAll("羚羊").total, 0, "删除后搜不到");
  } finally {
    close();
  }
});

test("全类型索引：6 类数据均可搜 + type/projectId 过滤", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "全类型项目" });
    const p2 = data.createProject({ name: "另一项目" });
    const t = data.createTask(p.id, { name: "独角鲸任务" });
    data.createAnnotation(p.id, t.id, { content: "批注甲虫标本" });
    data.createPlan(p.id, "方案河豚计划");
    data.createRequirement(p.id, { name: "需求灯塔工程" });
    data.createNote(p.id, { content: "备注夜莺观察" });
    // file：真实临时文件（登记时读 size/ext）
    const fdir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-ftmp-"));
    const fpath = path.join(fdir, "报表蓝鲸汇总.txt");
    fs.writeFileSync(fpath, "文件内容占位");
    data.addFile(p.id, fpath);
    data.createTask(p2.id, { name: "另一项目任务" });

    // 各类型命中（搜索词 ≥3 字走 FTS）
    const cases = [
      ["独角鲸", "task"],
      ["甲虫", "annotation"],
      ["河豚", "plan"],
      ["灯塔", "requirement"],
      ["夜莺", "note"],
      ["蓝鲸", "file"],
    ];
    for (const [kw, type] of cases) {
      const r = data.searchAll(kw);
      assert.ok(r.total >= 1, `「${kw}」应命中`);
      assert.equal(r.results[0].type, type, `「${kw}」应命中 ${type}`);
      assert.equal(r.results[0].projectId, p.id);
      assert.equal(r.results[0].projectName, "全类型项目");
      assert.ok(r.results[0].refId, "refId 非空");
    }

    // type 过滤
    const onlyTask = data.searchAll("计划", { type: "task" });
    assert.equal(onlyTask.total, 0, "type=task 时 plan 词不命中");
    const onlyPlan = data.searchAll("计划", { type: "plan" });
    assert.equal(onlyPlan.total, 1, "type=plan 时命中方案");

    // projectId 过滤
    const inP = data.searchAll("任务", { projectId: p.id });
    assert.ok(inP.results.every((x) => x.projectId === p.id), "projectId 过滤生效");
    const inP2 = data.searchAll("任务", { projectId: p2.id });
    assert.ok(inP2.total >= 1 && inP2.results.every((x) => x.projectId === p2.id));

    // snippet：FTS 结果带高亮（命中词出现在 snippet 或 title）
    const r = data.searchAll("独角鲸");
    assert.ok(r.results[0].snippet.includes("<mark>") || r.results[0].title.includes("独角鲸"));

    // project：项目名/描述纳入索引（V2.3 全局搜索优化）
    const projHit = data.searchAll("全类型项目").results.find((x) => x.type === "project");
    assert.ok(projHit, "项目名关键词命中 type=project");
    assert.equal(projHit.projectId, p.id, "project 结果 projectId=项目 id");
    assert.equal(projHit.projectName, "全类型项目", "project 结果 projectName=项目名");
    assert.equal(projHit.refId, p.id, "project 结果 refId=项目 id（跳转打开项目页）");
    data.updateProject(p.id, { description: "<p>项目描述独角犀牛</p>" });
    const projDesc = data.searchAll("独角犀牛").results.find((x) => x.type === "project");
    assert.ok(projDesc && projDesc.projectId === p.id, "项目描述命中 type=project");
    const onlyProj = data.searchAll("全类型项目", { type: "project" });
    assert.ok(onlyProj.results.length >= 1 && onlyProj.results.every((x) => x.type === "project"), "type=project 过滤生效");

    try { fs.rmSync(fdir, { recursive: true, force: true }); } catch { /* ignore */ }
  } finally {
    close();
  }
});

test("LIKE 兜底：1~2 字词命中（trigram 无法切分）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "模糊项目" });
    data.createTask(p.id, { name: "关键任务甲" });

    // 2 字词走 LIKE
    const r2 = data.searchAll("任务");
    assert.ok(r2.total >= 1, "2 字词应命中");
    assert.ok(r2.results.every((x) => x.type === "task"), "LIKE 结果类型正确");

    // 1 字词走 LIKE
    const r1 = data.searchAll("甲");
    assert.ok(r1.total >= 1, "1 字词应命中");

    // LIKE + type 过滤
    assert.equal(data.searchAll("任务", { type: "plan" }).total, 0, "type=plan 时 task 词不命中");

    // project 类型 LIKE 兜底：2 字项目名命中 type=project
    const p2 = data.createProject({ name: "短名项目" });
    const projLike = data.searchAll("短名").results.find((x) => x.type === "project" && x.projectId === p2.id);
    assert.ok(projLike, "2 字项目名 LIKE 命中 type=project");
    assert.equal(projLike.projectName, "短名项目");
  } finally {
    close();
  }
});

test("空 keyword 返回空结果不报错；ensureFtsReady 首次全量/二次空跑/清脏标记", () => {
  const { data, close } = newData();
  try {
    const empty = data.searchAll("");
    assert.equal(empty.total, 0);
    assert.ok(Array.isArray(empty.results));
    const blank = data.searchAll("   ");
    assert.equal(blank.total, 0, "纯空白按空处理");

    const p = data.createProject({ name: "索引就绪项目" });
    data.createTask(p.id, { name: "就绪任务乙" });

    const r1 = data.ensureFtsReady();
    assert.equal(r1.rebuilt, true, "首次全量重建");
    const r2 = data.ensureFtsReady();
    assert.equal(r2.rebuilt, false, "二次空跑");
    const dirty = data._db.prepare("SELECT COUNT(*) c FROM fts_dirty").get().c;
    assert.equal(dirty, 0, "全量后脏标记清空");
    assert.equal(data.searchAll("就绪任务乙").total, 1, "全量索引可直接搜");
  } finally {
    close();
  }
});

test("删除项目后 FTS 清理：搜不到该项目内容、fts_dirty 无残留", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "待删项目" });
    data.createTask(p.id, { name: "待删任务独角鲸" });
    assert.equal(data.searchAll("独角鲸").total, 1, "删除前可搜");

    data.deleteProject(p.id);
    // 删除会标脏 → 下次搜索重建（项目已不存在 → 空索引 + 清脏）
    assert.equal(data.searchAll("独角鲸").total, 0, "删除后搜不到");
    assert.equal(data.searchAll("待删项目").total, 0);
    const dirty = data._db.prepare("SELECT COUNT(*) c FROM fts_dirty WHERE project_id = ?").get(p.id).c;
    assert.equal(dirty, 0, "fts_dirty 无该项目残留");
    const entries = data._db.prepare("SELECT COUNT(*) c FROM fts_entries WHERE project_id = ?").get(p.id).c;
    assert.equal(entries, 0, "fts_entries 无该项目残留");
  } finally {
    close();
  }
});

// ===== 日期工具（批量写用例用 endDate 定位，避免干扰消息扫描） =====
function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(d, n) {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}
const TODAY = localToday();

// ===== 批量写路径 FTS 新鲜度（review 补测） =====
test("FTS 批量写新鲜度：createTasks / updateTasks 后搜索可搜到", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "批量项目" });
    const tasks = data.createTasks(p.id, [
      { name: "批量任务金丝猴", endDate: addDays(TODAY, 2) },
      { name: "批量任务梅花鹿", endDate: addDays(TODAY, 2) },
    ]);
    assert.equal(tasks.length, 2);
    assert.equal(data.searchAll("金丝猴").total, 1, "批量创建后可搜");
    assert.equal(data.searchAll("梅花鹿").total, 1);

    // 批量改名 → 新词命中、旧词消失
    const res = data.updateTasks(p.id, [
      { id: tasks[0].id, name: "改名树袋熊" },
      { id: tasks[1].id, name: "改名藏羚羊" },
    ]);
    assert.equal(res.failed.length, 0);
    assert.equal(data.searchAll("树袋熊").total, 1, "批量改名后可搜新词");
    assert.equal(data.searchAll("金丝猴").total, 0, "旧词消失");
  } finally {
    close();
  }
});

// ===== 特殊字符关键词不崩（review 补测） =====
test("searchAll 特殊字符：含引号/标点关键词不崩（FTS 短语转义 + LIKE 安全）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "特殊字符项目" });
    data.createTask(p.id, { name: "带\"引号\"的任务" });
    data.createTask(p.id, { name: "标点！？任务：冒号" });
    data.createTask(p.id, { name: "百分比%和下划线_任务" });

    // ≥3 字：FTS 短语转义（内部双引号不破坏 MATCH）
    const r1 = data.searchAll("引\"号\"");
    assert.ok(Array.isArray(r1.results), "引号词不崩");
    const r2 = data.searchAll("标点！？任务");
    assert.equal(r2.total, 1, "标点词可命中");

    // <3 字：LIKE 兜底（escapeLike 转义 % _）
    const r3 = data.searchAll("％");
    assert.ok(Array.isArray(r3.results), "百分号不崩");
    const r4 = data.searchAll("_");
    assert.ok(Array.isArray(r4.results), "下划线不崩");
    const r5 = data.searchAll("标点");
    assert.ok(r5.total >= 1, "2 字词 LIKE 命中");
  } finally {
    close();
  }
});

// ===== fullIndexed 字段（review #13：前端索引动效依赖） =====
test("searchAll 返回 fullIndexed：首次 false，ensureFtsReady 后 true", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "动效项目" });
    data.createTask(p.id, { name: "动效任务独角兽" });
    // 未全量索引前（仅增量重建脏项目）：fullIndexed=false
    const before = data.searchAll("独角兽");
    assert.equal(before.fullIndexed, false, "首次搜索 fullIndexed=false");
    assert.ok(before.indexed >= 1, "增量已重建本项目");

    data.ensureFtsReady();
    const after = data.searchAll("独角兽");
    assert.equal(after.fullIndexed, true, "全量后 fullIndexed=true");
  } finally {
    close();
  }
});

test("LIKE 富文本：annotation/note 剥 HTML 后匹配与展示（review #8）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "富文本项目" });
    const t = data.createTask(p.id, { name: "富文本任务" });
    data.createAnnotation(p.id, t.id, { content: "<p>批注琥珀词在段落中</p>" });
    data.createNote(p.id, { content: "<p>备注靛蓝词在段落中</p>" });

    // 2 字词走 LIKE：命中剥 HTML 后的纯文本
    const r1 = data.searchAll("琥珀词");
    const ann = r1.results.find((x) => x.type === "annotation");
    assert.ok(ann, "批注命中");
    assert.ok(!ann.title.includes("<p>"), "title 已剥 HTML");
    assert.ok(ann.title.includes("琥珀词"), "纯文本含命中词");
    assert.ok(ann.snippet.includes("<mark>"), "snippet 高亮");

    const r2 = data.searchAll("靛蓝词");
    const note = r2.results.find((x) => x.type === "note");
    assert.ok(note && !note.title.includes("<p>"), "备注剥 HTML");
  } finally {
    close();
  }
});

test("工具层：search_all 冒烟（JSON 输出 / 空 keyword / 参数校验）", async () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "搜索工具项目" });
    data.createTask(p.id, { name: "独角仙任务" });
    const dbPath = data._db.name;
    const ctx = { dataDir: path.dirname(dbPath) };

    const { execute } = await import("../../tools/search-all.js");

    const res = await execute({ keyword: "独角仙" }, ctx);
    const json = JSON.parse(res.content[0].text);
    assert.ok(json.total >= 1 && json.results[0].type === "task");
    assert.ok(Number.isInteger(json.indexed), "含 indexed");
    assert.ok(json.results[0].projectName === "搜索工具项目");

    const emptyRes = await execute({ keyword: "" }, ctx);
    assert.equal(JSON.parse(emptyRes.content[0].text).total, 0);

    await assert.rejects(() => execute({ keyword: "x", type: "bad" }, ctx), /type 仅支持/);
    await assert.rejects(() => execute({ keyword: "x", projectId: "nope" }, ctx), /不存在/);
  } finally {
    close();
  }
});
