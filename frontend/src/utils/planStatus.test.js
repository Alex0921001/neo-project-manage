import { describe, it, expect } from "vitest";
import { planStatusKey, PLAN_STATUS_OPTIONS } from "./planStatus.js";

describe("planStatusKey 状态映射", () => {
  it("四态映射正确", () => {
    expect(planStatusKey("草稿")).toBe("draft");
    expect(planStatusKey("进行中")).toBe("doing");
    expect(planStatusKey("已采纳")).toBe("done");
    expect(planStatusKey("已废弃")).toBe("abandoned");
  });

  it("未知状态兜底为 draft", () => {
    expect(planStatusKey("未知")).toBe("draft");
    expect(planStatusKey()).toBe("draft");
    expect(planStatusKey(null)).toBe("draft");
  });
});

describe("PLAN_STATUS_OPTIONS", () => {
  it("包含四个合法状态", () => {
    expect(PLAN_STATUS_OPTIONS).toEqual(["草稿", "进行中", "已采纳", "已废弃"]);
  });
});
