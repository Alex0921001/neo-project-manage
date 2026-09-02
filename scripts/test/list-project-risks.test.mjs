/**
 * neo-project-manage list_project_risks 口径测试（node:test）
 *
 * V2.3 review #1：项目过滤 archived=false 且 status∈{进行中,待开始}；风险只保留 high/medium
 * （low 不入列、不计 totalLow）；projectCount 按过滤后口径。与 data.js scanMessages risk 口径一致。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const { execute } = await import("../../tools/list-project-risks.js");

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

async function run(dataDir, input = {}) {
  const res = await execute(input, { dataDir });
  return JSON.parse(res.content[0].text);
}

test("list_project_risks 口径：归档/已完成不出现、low 不入列、projectCount 按过滤后", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-lpr-"));
  const data = createDataAccess(dir);
  try {
    // A：进行中 + 延期任务 → high → 计入
    const a = data.createProject({ name: "高风险A", status: "进行中", planStart: "2026-01-01", planEnd: "2026-12-31" });
    data.createTask(a.id, { name: "延期任务", endDate: addDays(TODAY, -2) });
    // B：进行中 + 仅 low（3 个无日期任务）→ 不入列、low 不计
    const b = data.createProject({ name: "低风险B", status: "进行中" });
    data.createTask(b.id, { name: "无日期1" });
    data.createTask(b.id, { name: "无日期2" });
    data.createTask(b.id, { name: "无日期3" });
    // C：归档 + 延期任务 → 不出现
    const c = data.createProject({ name: "归档C", status: "进行中" });
    data.createTask(c.id, { name: "归档内延期", endDate: addDays(TODAY, -3) });
    data.updateProject(c.id, { archived: true });
    // D：已完成 + 延期任务 → 不出现
    const d = data.createProject({ name: "完成D", status: "已完成" });
    data.createTask(d.id, { name: "完成内延期", endDate: addDays(TODAY, -3) });
    // E：待开始 + 延期任务 → 计入（status=待开始 允许）
    const e = data.createProject({ name: "待开始E", status: "待开始", planStart: "2026-01-01", planEnd: "2026-12-31" });
    data.createTask(e.id, { name: "待开始延期", endDate: addDays(TODAY, -2) });
    // F：已取消 → 不出现
    const f = data.createProject({ name: "取消F", status: "已取消" });
    data.createTask(f.id, { name: "取消内延期", endDate: addDays(TODAY, -2) });

    const r = await run(dir);
    // projectCount = A/B/E（进行中×2 + 待开始×1），归档/已完成/已取消排除
    assert.equal(r.summary.projectCount, 3, "projectCount 按过滤后口径");
    assert.equal(r.summary.riskProjects, 2, "有中高风险的项目 = A + E");
    assert.equal(r.summary.high, 2, "high = A + E 各 1");
    assert.equal(r.summary.medium, 0);
    assert.equal(r.summary.low, 0, "low 不计入");
    assert.equal(r.summary.totalRisks, 2);

    // rows 只含 A/E；B 只有 low 不入列；C/D/F 不出现
    const names = r.projects.map((x) => x.projectName);
    assert.deepEqual(names.sort(), ["待开始E", "高风险A"], "rows 仅 A/E");
    assert.ok(!names.includes("低风险B"), "仅 low 不入列");
    assert.ok(!names.includes("归档C"), "归档不出现");
    assert.ok(!names.includes("完成D"), "已完成不出现");
    assert.ok(!names.includes("取消F"), "已取消不出现");

    // 每条 risks 只有 high/medium
    for (const p of r.projects) {
      assert.ok(p.risks.every((x) => x.level === "high" || x.level === "medium"), "risks 仅 high/medium");
    }
  } finally {
    try { data._db.close(); } catch { /* ignore */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test("list_project_risks includeNoRisk=true：无中高风险项目入列（riskCount=0），projectCount 口径不变", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-lpr2-"));
  const data = createDataAccess(dir);
  try {
    data.createProject({ name: "有风险", status: "进行中" });
    data.createTask(data.listProjects()[0].id, { name: "无日期1" });
    data.createTask(data.listProjects()[0].id, { name: "无日期2" });
    data.createTask(data.listProjects()[0].id, { name: "无日期3" }); // 仅 low
    data.createProject({ name: "归档项目", status: "进行中" });
    data.updateProject(data.listProjects().find((x) => x.name === "归档项目").id, { archived: true });

    const r = await run(dir, { includeNoRisk: true });
    assert.equal(r.summary.projectCount, 1, "过滤后仅 1 个进行中项目");
    const rows = r.projects;
    assert.equal(rows.length, 1, "includeNoRisk 把无中高风险项目也入列");
    assert.equal(rows[0].riskCount, 0);
    assert.equal(rows[0].risks.length, 0);
    assert.ok(!rows.some((x) => x.projectName === "归档项目"), "归档仍不出现");
  } finally {
    try { data._db.close(); } catch { /* ignore */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
