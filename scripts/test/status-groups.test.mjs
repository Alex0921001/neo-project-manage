/**
 * 项目状态分组配置回归测试（node:test）
 *
 * 覆盖：默认值、脏值归一、order 去重补全、旧配置降级、整份覆盖写入
 * 用法：NVM_SKIP_VENDOR=1 node --test scripts/test/status-groups.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";
import { STATUS_GROUP_KEYS, normalizeStatusGroups } from "../../lib/domain/settings.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-status-groups-"));
let data;

before(() => {
  data = createDataAccess(tmpDir);
});
after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test("默认配置：7 个分组键，归档默认隐藏，其余可见，归档数量 5、其余 all", () => {
  const cfg = data.getProjectStatusGroups();
  assert.deepEqual(cfg.order, STATUS_GROUP_KEYS);
  assert.equal(cfg.order.length, 7);
  assert.equal(cfg.visible["已归档"], false);
  for (const k of STATUS_GROUP_KEYS.filter((k) => k !== "已归档")) {
    assert.equal(cfg.visible[k], true, `${k} 应默认可见`);
  }
  for (const k of STATUS_GROUP_KEYS) {
    assert.equal(cfg.limit[k], k === "已归档" ? 5 : "all", `${k} 默认数量不符`);
  }
  // 已延期不是配置键
  assert.equal(cfg.order.includes("已延期"), false);
  assert.equal("已延期" in cfg.visible, false);
  assert.equal("已延期" in cfg.limit, false);
});

test("归一化：非法数量回落 all，合法档位保留", () => {
  const cfg = normalizeStatusGroups({
    order: STATUS_GROUP_KEYS,
    visible: {},
    limit: { 待开始: 10, 进行中: 7, 已完成: 0, 已取消: "20", 预开始: 5, 预结束: 15, 已归档: 20 },
  });
  assert.equal(cfg.limit["待开始"], 10);
  assert.equal(cfg.limit["预开始"], 5);
  assert.equal(cfg.limit["预结束"], 15);
  assert.equal(cfg.limit["已归档"], 20);
  // 7 不在档位内、0 非法、"20" 是字符串非法
  assert.equal(cfg.limit["进行中"], "all");
  assert.equal(cfg.limit["已完成"], "all");
  assert.equal(cfg.limit["已取消"], "all");
});

test("归一化：非布尔 visible 回落默认值", () => {
  const cfg = normalizeStatusGroups({
    order: STATUS_GROUP_KEYS,
    visible: { 已归档: "yes", 待开始: 0, 进行中: true },
    limit: {},
  });
  assert.equal(cfg.visible["已归档"], false, "字符串不是布尔，回落默认隐藏");
  assert.equal(cfg.visible["待开始"], true, "数字不是布尔，回落默认可见");
  assert.equal(cfg.visible["进行中"], true);
});

test("归一化：order 去重并补全缺失键", () => {
  const cfg = normalizeStatusGroups({
    order: ["进行中", "进行中", "待开始"],
    visible: {},
    limit: {},
  });
  assert.equal(cfg.order.length, 7, "去重后应补全为 7 键");
  assert.deepEqual(cfg.order.slice(0, 3), ["进行中", "待开始", "预开始"], "保留传入顺序，缺失按默认顺序补齐");
  assert.equal(new Set(cfg.order).size, 7);
});

test("归一化：旧配置里的「已延期」键被丢弃，不报错", () => {
  const cfg = normalizeStatusGroups({
    order: ["预开始", "待开始", "已延期", "进行中", "预结束", "已完成", "已取消", "已归档"],
    visible: { 已延期: true, 已归档: false },
    limit: { 已延期: 10 },
  });
  assert.equal(cfg.order.includes("已延期"), false);
  assert.equal("已延期" in cfg.visible, false);
  assert.equal("已延期" in cfg.limit, false);
  assert.equal(cfg.order.length, 7);
});

test("归一化：完全脏数据（null/数组/坏 JSON 字符串）回落默认", () => {
  for (const raw of [null, undefined, [], 42, "{bad json", []]) {
    const cfg = normalizeStatusGroups(raw);
    assert.deepEqual(cfg.order, STATUS_GROUP_KEYS);
    assert.equal(cfg.visible["已归档"], false);
  }
});

test("整份覆盖写入并读回一致", () => {
  const input = {
    order: ["已归档", "预开始", "待开始", "进行中", "预结束", "已完成", "已取消"],
    visible: { 已归档: true, 预开始: false },
    limit: { 待开始: 5, 已归档: 10 },
  };
  const written = data.updateProjectStatusGroups(input);
  const read = data.getProjectStatusGroups();
  assert.deepEqual(read, written, "写入返回与读回应完全一致");
  assert.equal(read.order[0], "已归档");
  assert.equal(read.visible["已归档"], true);
  assert.equal(read.visible["预开始"], false);
  assert.equal(read.limit["待开始"], 5);
  assert.equal(read.limit["已归档"], 10);
  // 未传的键回落默认
  assert.equal(read.visible["进行中"], true);
  assert.equal(read.limit["进行中"], "all");
});

test("写入后再次写入为整份覆盖，不残留上次的键值", () => {
  data.updateProjectStatusGroups({
    order: STATUS_GROUP_KEYS,
    visible: { 已归档: true },
    limit: { 待开始: 20 },
  });
  const cfg = data.getProjectStatusGroups();
  assert.equal(cfg.visible["已归档"], true);
  assert.equal(cfg.limit["待开始"], 20);
  assert.equal(cfg.order.length, 7);
});
