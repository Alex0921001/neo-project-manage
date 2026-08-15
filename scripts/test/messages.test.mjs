/**
 * neo-project-manage V2.3 R1 消息中心测试（node:test）
 *
 * 覆盖：deadline 聚合（3 天内到期 1 条聚合 / 出窗口不生成）、幂等（同 batch_key 不重复插入）、
 * 风险口径（归档/已完成不生成、非归档进行中仅 high+medium）、已读/未读/删除/筛选。
 * 说明：每个 test 独立临时库（batch_key 全局幂等，避免跨用例污染）；跑完自动清理。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

/** 独立临时库（close 释放句柄后清理，规避 Windows 文件占用） */
function newData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-msg-"));
  const data = createDataAccess(dir);
  return {
    data,
    close: () => {
      try { data._db.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

// ===== 日期工具（与 data 层同口径：本地日期 + UTC 加减）=====
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

test("deadline 聚合：3 天内到期任务生成 1 条聚合消息，二次扫描不重复（幂等）", () => {
  const { data, close } = newData();
  try {
    const a = data.createProject({ name: "到期甲", status: "进行中" });
    const b = data.createProject({ name: "到期乙", status: "进行中" });
    data.createTask(a.id, { name: "任务A-临近", endDate: addDays(TODAY, 2) });
    data.createTask(a.id, { name: "任务B-今天", endDate: TODAY });
    data.createTask(b.id, { name: "任务C-三天", endDate: addDays(TODAY, 3) });
    // 窗口外与已完成任务不入聚合
    data.createTask(a.id, { name: "窗口外", endDate: addDays(TODAY, 5) });
    const doneTask = data.createTask(a.id, { name: "已完成任务", endDate: TODAY });
    data.updateTask(a.id, doneTask.id, { done: true }); // createTask 不接 done，用 updateTask 标记完成

    const m1 = data.listMessages({ type: "deadline" });
    assert.equal(m1.total, 1, "应恰 1 条聚合消息");
    const d = m1.items[0];
    assert.equal(d.type, "deadline");
    assert.equal(d.projectId, null, "跨项目聚合消息不归属任何项目");
    assert.match(d.title, /2 个项目共 3 条任务即将到期/);
    assert.ok(d.content.includes("任务A-临近") && d.content.includes("任务C-三天"), "content 含明细");
    assert.ok(!d.content.includes("窗口外"), "窗口外任务不入聚合");
    assert.ok(!d.content.includes("已完成任务"), "已完成任务不入聚合");
    assert.equal(d.read, false);

    // 幂等：直接再扫两次 + 再 listMessages，仍 1 条
    data.scanMessages();
    data.scanMessages();
    const m2 = data.listMessages({ type: "deadline" });
    assert.equal(m2.total, 1, "同 batch_key 不重复插入");
    assert.equal(m1.items[0].id, m2.items[0].id, "同一条消息，ID 不变");
  } finally {
    close();
  }
});

test("deadline 出窗口：无 3 天内到期任务时不生成消息", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "无到期" });
    data.createTask(p.id, { name: "五天后的任务", endDate: addDays(TODAY, 5) });
    data.createTask(p.id, { name: "已过期的任务", endDate: addDays(TODAY, -1) }); // 延期但不在「即将到期」窗口
    const m = data.listMessages({ type: "deadline" });
    assert.equal(m.total, 0, "窗口外不生成 deadline 消息");
  } finally {
    close();
  }
});

test("风险口径：跨项目聚合为 1 条；归档/已完成不生成；仅 high+medium；low 不生成", () => {
  const { data, close } = newData();
  try {
    // A：进行中 + 延期任务 → high
    const a = data.createProject({ name: "高风险A", status: "进行中", planStart: "2026-01-01", planEnd: "2026-12-31" });
    data.createTask(a.id, { name: "延期任务", endDate: addDays(TODAY, -2) });
    // B：进行中 + 逼近截止 → medium
    const b = data.createProject({ name: "中风险B", status: "进行中" });
    data.createTask(b.id, { name: "临近任务", endDate: addDays(TODAY, 1) });
    // C：归档 + 延期任务 → 不生成
    const c = data.createProject({ name: "归档C", status: "进行中" });
    data.createTask(c.id, { name: "归档内延期", endDate: addDays(TODAY, -3) });
    data.updateProject(c.id, { archived: true });
    // D：已完成 + 延期任务 → 不生成
    const d = data.createProject({ name: "完成D", status: "已完成" });
    data.createTask(d.id, { name: "完成内延期", endDate: addDays(TODAY, -3) });
    // E：进行中但仅 low 风险（≥3 任务无日期）→ 不生成
    const e = data.createProject({ name: "低风险E", status: "进行中" });
    data.createTask(e.id, { name: "无日期1" });
    data.createTask(e.id, { name: "无日期2" });
    data.createTask(e.id, { name: "无日期3" });

    const m = data.listMessages({ type: "risk" });
    assert.equal(m.total, 1, "跨项目聚合为 1 条（batch_key=risk|date）");
    const risk = m.items[0];
    assert.equal(risk.projectId, null, "聚合消息不归属任何项目");
    assert.match(risk.title, /2 个项目共 2 条风险提醒/, "A(high) + B(medium) 两条风险");
    assert.ok(risk.content.includes("高风险A"), "content 含高风险项目明细");
    assert.ok(risk.content.includes("中风险B"), "content 含中风险项目明细");
    assert.ok(risk.content.includes("[高]"), "含高等级标记");
    assert.ok(risk.content.includes("[中]"), "含中等级标记");
    assert.ok(!risk.content.includes("归档C"), "归档项目不入聚合");
    assert.ok(!risk.content.includes("完成D"), "已完成项目不入聚合");
    assert.ok(!risk.content.includes("低风险E"), "仅 low 风险项目不入聚合");
    assert.ok(!risk.content.includes("缺少起止日期"), "不含 low 风险内容");

    // 幂等：再扫不重复
    data.scanMessages();
    assert.equal(data.listMessages({ type: "risk" }).total, 1, "同 batch_key 不重复插入");
  } finally {
    close();
  }
});

test("已读/未读/删除/项目过滤/类型过滤（聚合消息全局可见，项目过滤为空）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "读写项目", status: "进行中" });
    data.createTask(p.id, { name: "读写任务", endDate: addDays(TODAY, 1) });

    const unreadAll = data.getMessageUnreadCount();
    assert.equal(unreadAll, 2, "deadline + risk 各 1 条全局未读");
    assert.equal(data.getMessageUnreadCount(p.id), 0, "聚合消息不归属项目，项目级未读为 0");

    // 项目过滤：聚合消息（project_id=NULL）不返回
    const projMsgs = data.listMessages({ projectId: p.id });
    assert.equal(projMsgs.total, 0, "项目过滤为空");

    // 类型过滤
    const onlyRisk = data.listMessages({ type: "risk" });
    assert.equal(onlyRisk.total, 1);
    assert.equal(onlyRisk.items[0].type, "risk");

    // 标记已读
    const id = onlyRisk.items[0].id;
    const r = data.markMessageRead([id]);
    assert.equal(r.updated, 1);
    assert.equal(data.getMessageUnreadCount(), 1, "标记后全局未读剩 deadline 1 条");
    const afterRead = data.listMessages({ type: "risk" });
    assert.equal(afterRead.items[0].read, true);
    assert.equal(afterRead.unread, 0);

    // 幂等重复标记
    assert.equal(data.markMessageRead([id]).updated, 0, "已读重复标记不再更新");
    // 空 ids 直接返回 updated 0
    assert.deepEqual(data.markMessageRead([]), { updated: 0 });

    // 分页：limit 生效
    const page = data.listMessages({ limit: 1 });
    assert.equal(page.items.length, 1);
    assert.equal(page.total, 2);

    // 删除
    assert.equal(data.deleteMessage(id), true);
    assert.ok(!data.listMessages({ type: "risk" }).items.some((x) => x.id === id), "删除后不再返回");
    assert.throws(() => data.deleteMessage(id), /不存在/, "重复删除报错");
  } finally {
    close();
  }
});

test("synergy 预留：scanMessages 不生成 synergy 消息", () => {
  const { data, close } = newData();
  try {
    data.scanMessages();
    const m = data.listMessages({ type: "synergy" });
    assert.equal(m.total, 0, "synergy 骨架存在但暂不生成");
  } finally {
    close();
  }
});

test("deadline 排除归档项目（与 risk 口径一致，review #7）", () => {
  const { data, close } = newData();
  try {
    const active = data.createProject({ name: "活动项目", status: "进行中" });
    const arch = data.createProject({ name: "归档项目", status: "进行中" });
    data.createTask(active.id, { name: "活动到期任务", endDate: addDays(TODAY, 1) });
    data.createTask(arch.id, { name: "归档到期任务", endDate: addDays(TODAY, 1) });
    data.updateProject(arch.id, { archived: true });

    const m = data.listMessages({ type: "deadline" });
    assert.equal(m.total, 1, "聚合 1 条");
    const d = m.items[0];
    assert.match(d.title, /1 个项目共 1 条任务即将到期/, "归档项目到期任务不计数");
    assert.ok(d.content.includes("活动到期任务"), "含活动项目任务");
    assert.ok(!d.content.includes("归档到期任务"), "不含归档项目任务");
  } finally {
    close();
  }
});

test("删除任务后当日消息不新增（快照保留 + 短路，review 补测）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "快照项目", status: "进行中" });
    const t = data.createTask(p.id, { name: "快照到期任务", endDate: addDays(TODAY, 1) });

    // 首次扫描生成快照
    const m1 = data.listMessages({ type: "deadline" });
    assert.equal(m1.total, 1);
    assert.ok(m1.items[0].content.includes("快照到期任务"));

    // 删除任务 → 当日 batch_key 已存在（短路），不新增、不产生含该任务的新消息
    data.deleteTask(p.id, t.id);
    data.scanMessages();
    const m2 = data.listMessages({ type: "deadline" });
    assert.equal(m2.total, 1, "同日不新增消息（快照保留）");
    assert.equal(m2.items[0].id, m1.items[0].id, "仍是原快照消息");
  } finally {
    close();
  }
});

test("工具层：list_messages / mark_message_read / get_message_unread_count / delete_message 冒烟", async () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "工具冒烟", status: "进行中" });
    data.createTask(p.id, { name: "工具任务", endDate: addDays(TODAY, 1) });

    const { execute: list } = await import("../../tools/list-messages.js");
    const { execute: markRead } = await import("../../tools/mark-message-read.js");
    const { execute: unreadCount } = await import("../../tools/get-message-unread-count.js");
    const { execute: del } = await import("../../tools/delete-message.js");

    // 用实际 dataDir：临时库目录 = db 文件所在目录
    const dbPath = data._db.name; // 形如 <dir>/projects.sqlite
    const dataDir = path.dirname(dbPath);
    const ctx = { dataDir };

    const listRes = await list({}, ctx);
    const listJson = JSON.parse(listRes.content[0].text);
    assert.ok(Array.isArray(listJson.items) && listJson.items.length >= 2, "工具返回 {total, unread, items}");

    const cntRes = await unreadCount({}, ctx);
    assert.equal(JSON.parse(cntRes.content[0].text).unread, 2, "全局未读 = deadline + risk 各 1");

    // risk 消息跨项目聚合（projectId=null），找它并标记已读
    const riskMsg = listJson.items.find((x) => x.type === "risk");
    assert.ok(riskMsg, "存在 risk 消息");
    const markRes = await markRead({ ids: [riskMsg.id] }, ctx);
    assert.equal(JSON.parse(markRes.content[0].text).updated, 1);
    assert.equal(JSON.parse((await unreadCount({}, ctx)).content[0].text).unread, 1, "标记后全局剩 1 条未读");

    const delRes = await del({ id: riskMsg.id }, ctx);
    assert.equal(JSON.parse(delRes.content[0].text).ok, true);

    // 参数校验：非法 type 拒绝
    await assert.rejects(() => list({ type: "bad" }, ctx), /type 仅支持/);
    await assert.rejects(() => markRead({ ids: [] }, ctx), /ids 不能为空/);
    await assert.rejects(() => del({ id: "" }, ctx), /id 不能为空/);
  } finally {
    close();
  }
});
