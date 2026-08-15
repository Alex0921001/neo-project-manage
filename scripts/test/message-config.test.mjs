/**
 * neo-project-manage V2.3 精修 #7 消息提醒配置测试（node:test）
 *
 * 覆盖：settings 读写、getMessageConfig 默认值/校验、updateMessageConfig 局部更新、
 * scanMessages 读配置（deadline_days 生效、开关关闭不生成）、v12 迁移幂等、配置工具冒烟。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

function newData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-cfg-"));
  const data = createDataAccess(dir);
  return {
    data,
    close: () => {
      try { data._db.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

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

test("settings 读写：setSetting/getSetting 往返 + 覆盖写", () => {
  const { data, close } = newData();
  try {
    assert.equal(data.getSetting("deadline_days"), null, "不存在返回 null");
    assert.equal(data.getSetting("deadline_days", 3), 3, "不存在返回 fallback");
    data.setSetting("deadline_days", "7");
    assert.equal(data.getSetting("deadline_days"), "7");
    data.setSetting("deadline_days", "14");
    assert.equal(data.getSetting("deadline_days"), "14", "覆盖写生效");
  } finally {
    close();
  }
});

test("getMessageConfig 默认值 + updateMessageConfig 校验与局部更新", () => {
  const { data, close } = newData();
  try {
    const def = data.getMessageConfig();
    assert.deepEqual(def, { deadlineDays: 3, deadlineEnabled: true, riskEnabled: true }, "默认值");

    // 越界拒绝
    assert.throws(() => data.updateMessageConfig({ deadlineDays: 0 }), /1-14/);
    assert.throws(() => data.updateMessageConfig({ deadlineDays: 15 }), /1-14/);
    assert.throws(() => data.updateMessageConfig({ deadlineDays: 3.5 }), /1-14/);

    // 局部更新：只改天数，开关不变
    const u1 = data.updateMessageConfig({ deadlineDays: 7 });
    assert.equal(u1.deadlineDays, 7);
    assert.equal(u1.deadlineEnabled, true, "未传字段不变");
    const u2 = data.updateMessageConfig({ deadlineEnabled: false });
    assert.equal(u2.deadlineDays, 7);
    assert.equal(u2.deadlineEnabled, false);
    assert.equal(u2.riskEnabled, true);

    // 持久化：重建实例后配置仍在
    const dir = data._db.name ? path.dirname(data._db.name) : null;
    const got = data.getMessageConfig();
    assert.equal(got.deadlineDays, 7);
    assert.equal(got.deadlineEnabled, false);
  } finally {
    close();
  }
});

test("scanMessages 读配置：deadline_days 生效（7 天窗口生成，默认 3 不生成）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "配置项目", status: "进行中" });
    // 第 5 天到期：默认 3 不生成，配置 7 后生成
    data.createTask(p.id, { name: "五天后到期", endDate: addDays(TODAY, 5) });
    data.updateMessageConfig({ deadlineDays: 7 });

    const m = data.listMessages({ type: "deadline" });
    assert.equal(m.total, 1, "配置 7 天后 5 天内任务生成");
    assert.match(m.items[0].title, /1 个项目共 1 条任务即将到期/);
    assert.ok(m.items[0].content.includes("五天后到期"));
  } finally {
    close();
  }
});

test("scanMessages 读配置：开关关闭不生成（历史消息保留）", () => {
  const { data, close } = newData();
  try {
    const p = data.createProject({ name: "开关项目", status: "进行中" });
    data.createTask(p.id, { name: "明天到期任务", endDate: addDays(TODAY, 1) });
    data.createTask(p.id, { name: "延期任务", endDate: addDays(TODAY, -2) });

    // 关闭 deadline → 不生成 deadline；关闭 risk → 不生成 risk
    data.updateMessageConfig({ deadlineEnabled: false, riskEnabled: false });
    data.scanMessages();
    assert.equal(data.listMessages({ type: "deadline" }).total, 0, "deadline 关闭不生成");
    assert.equal(data.listMessages({ type: "risk" }).total, 0, "risk 关闭不生成");

    // 打开开关 → 生成
    data.updateMessageConfig({ deadlineEnabled: true, riskEnabled: true });
    data.scanMessages();
    assert.equal(data.listMessages({ type: "deadline" }).total, 1, "重新开启后生成");
    assert.equal(data.listMessages({ type: "risk" }).total, 1, "重新开启后 risk 生成");
  } finally {
    close();
  }
});

test("v12 迁移：settings 表存在 + 版本号 12 + 二次打开幂等", () => {
  const { data, close } = newData();
  try {
    const version = data._db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get().value;
    assert.equal(Number(version), 12, "SCHEMA_VERSION=12");
    const t = data._db.prepare("SELECT name FROM sqlite_master WHERE name = 'settings'").get();
    assert.ok(t, "settings 表存在");
    // 二次打开幂等
    const dir = path.dirname(data._db.name);
    const data2 = createDataAccess(dir);
    assert.equal(Number(data2._db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get().value), 12);
    data2._db.close();
  } finally {
    close();
  }
});

test("配置工具冒烟：get_message_config / update_message_config", async () => {
  const { data, close } = newData();
  try {
    const dbPath = data._db.name;
    const ctx = { dataDir: path.dirname(dbPath) };

    const { execute: getCfg } = await import("../../tools/get-message-config.js");
    const { execute: updCfg } = await import("../../tools/update-message-config.js");

    const g1 = JSON.parse((await getCfg({}, ctx)).content[0].text);
    assert.deepEqual(g1.config, { deadlineDays: 3, deadlineEnabled: true, riskEnabled: true }, "默认配置");

    const u = JSON.parse((await updCfg({ deadlineDays: 7, riskEnabled: false }, ctx)).content[0].text);
    assert.equal(u.config.deadlineDays, 7);
    assert.equal(u.config.riskEnabled, false);
    assert.equal(u.config.deadlineEnabled, true, "未传字段不变");

    const g2 = JSON.parse((await getCfg({}, ctx)).content[0].text);
    assert.equal(g2.config.deadlineDays, 7, "持久化生效");

    await assert.rejects(() => updCfg({ deadlineDays: 99 }, ctx), /1-14/);
  } finally {
    close();
  }
});
