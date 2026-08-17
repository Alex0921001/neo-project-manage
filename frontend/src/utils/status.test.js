import { describe, it, expect } from "vitest";
import { computeDisplayStatus } from "./status.js";

describe("computeDisplayStatus 项目展示状态", () => {
  it("空项目兜底待开始", () => {
    expect(computeDisplayStatus(null)).toBe("待开始");
    expect(computeDisplayStatus(undefined)).toBe("待开始");
  });

  it("已完成/已取消不判延期", () => {
    const done = { status: "已完成", planStart: "2020-01-01", planEnd: "2020-01-01" };
    const cancel = { status: "已取消", planStart: "2020-01-01", planEnd: "2020-01-01" };
    expect(computeDisplayStatus(done)).toBe("已完成");
    expect(computeDisplayStatus(cancel)).toBe("已取消");
  });

  it("待开始且 start 已过 → 已延期", () => {
    const p = { status: "待开始", planStart: "2020-01-01", planEnd: "2099-01-01" };
    expect(computeDisplayStatus(p)).toBe("已延期");
  });

  it("进行中且 end 已过 → 已延期", () => {
    const p = { status: "进行中", planStart: "2020-01-01", planEnd: "2020-02-01" };
    expect(computeDisplayStatus(p)).toBe("已延期");
  });

  it("进行中且 end 未过 → 保持进行中", () => {
    const p = { status: "进行中", planStart: "2026-01-01", planEnd: "2099-12-31" };
    expect(computeDisplayStatus(p)).toBe("进行中");
  });
});
