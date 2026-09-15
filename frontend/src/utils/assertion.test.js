// 数据断言四元组工具测试（录入/摘要与后端断言引擎同口径）
import { describe, it, expect } from "vitest";
import {
  ASSERTION_OP_OPTIONS,
  parseAssertion,
  assertionSummary,
  buildAssertionInstruction,
  opNeedsValue,
} from "./assertion.js";

describe("parseAssertion", () => {
  it("合法四元组 JSON 正常解析", () => {
    const a = parseAssertion('{"target":"comment:36db7c28","field":"quote_anchor","op":"not_null","value":null}');
    expect(a).toEqual({ target: "comment:36db7c28", field: "quote_anchor", op: "not_null", value: null });
  });

  it("非 JSON / 缺要素返回 null", () => {
    expect(parseAssertion("npm test，检查 fail=0")).toBeNull(); // agent 指令不是 JSON
    expect(parseAssertion('{"field":"f","op":"eq","value":1}')).toBeNull(); // 缺 target
    expect(parseAssertion('{"target":"comment:x","op":"eq","value":1}')).toBeNull(); // 缺 field
    expect(parseAssertion('{"target":"comment:x","field":"f","value":1}')).toBeNull(); // 缺 op
    expect(parseAssertion("")).toBeNull();
    expect(parseAssertion(null)).toBeNull();
    expect(parseAssertion("[1,2]")).toBeNull(); // 数组无效
  });
});

describe("assertionSummary", () => {
  it("摘要格式：字段 · 操作符标签", () => {
    expect(assertionSummary('{"target":"comment:x","field":"quote_anchor","op":"not_null"}')).toBe("quote_anchor · 非空");
    expect(assertionSummary('{"target":"tasks:x","field":"priority","op":"eq","value":"P0"}')).toBe("priority · 等于");
    expect(assertionSummary('{"target":"tasks:x","field":"done","op":"eq","value":1}')).toBe("done · 等于");
    expect(assertionSummary("坏 JSON")).toBeNull();
  });
});

describe("buildAssertionInstruction", () => {
  it("数值/布尔/null 期望值按原类型序列化", () => {
    expect(JSON.parse(buildAssertionInstruction({ target: "tasks:x ", field: "done", op: "eq", value: "1" })))
      .toEqual({ target: "tasks:x", field: "done", op: "eq", value: 1 });
    expect(JSON.parse(buildAssertionInstruction({ target: "comment:x", field: "quote_anchor", op: "not_null", value: "" })))
      .toEqual({ target: "comment:x", field: "quote_anchor", op: "not_null", value: null });
    expect(JSON.parse(buildAssertionInstruction({ target: "plans:x", field: "title", op: "contains", value: "OAuth2" })))
      .toEqual({ target: "plans:x", field: "title", op: "contains", value: "OAuth2" });
    expect(JSON.parse(buildAssertionInstruction({ target: "annotations:x", field: "confirmed", op: "eq", value: "true" })))
      .toEqual({ target: "annotations:x", field: "confirmed", op: "eq", value: true });
  });

  it("非 JSON 字面量保留为字符串", () => {
    const a = JSON.parse(buildAssertionInstruction({ target: "projects:x", field: "status", op: "eq", value: "进行中" }));
    expect(a.value).toBe("进行中");
  });
});

describe("opNeedsValue", () => {
  it("not_null / null 不需要期望值", () => {
    expect(opNeedsValue("not_null")).toBe(false);
    expect(opNeedsValue("null")).toBe(false);
    expect(opNeedsValue("eq")).toBe(true);
    expect(opNeedsValue("contains")).toBe(true);
  });
});

describe("ASSERTION_OP_OPTIONS", () => {
  it("第一版操作符集合与后端口径一致（9 个）", () => {
    expect(ASSERTION_OP_OPTIONS.map((o) => o.value)).toEqual([
      "not_null", "null", "eq", "neq", "gt", "gte", "lt", "lte", "contains",
    ]);
  });
});
