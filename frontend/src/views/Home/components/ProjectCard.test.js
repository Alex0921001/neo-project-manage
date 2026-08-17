import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectCard from "./ProjectCard.vue";

vi.mock("../../../toast.js", () => ({ toast: vi.fn() }));

const baseProject = {
  id: "p1",
  name: "测试项目",
  pinned: false,
  archived: false,
  status: "进行中",
  planStart: "2026-08-01",
  planEnd: "2026-08-31",
  taskCount: 10,
  incompleteTaskCount: 4,
  reqCount: 3,
  planCount: 2,
  noteCount: 5,
  fileCount: 1,
  description: "",
};

describe("ProjectCard 统计行（V2.3.2：图标改文字）", () => {
  it("渲染 任务/需求/方案/备注/文件 五个文字统计", () => {
    const wrapper = mount(ProjectCard, { props: { project: baseProject, setLabel: "" } });
    const stats = wrapper.find(".card-stats");
    const text = stats.text();

    // 文字标签
    expect(text).toContain("任务");
    expect(text).toContain("需求");
    expect(text).toContain("方案");
    expect(text).toContain("备注");
    expect(text).toContain("文件");

    // 数值：任务 6/10（10-4），需求 3，方案 2，备注 5，文件 1
    expect(text).toContain("6/10");
    expect(text).toContain("3");
    expect(text).toContain("2");
    expect(text).toContain("5");
    expect(text).toContain("1");

    // 不再使用 svg 图标
    expect(stats.find("svg").exists()).toBe(false);
  });

  it("统计为零时显示 0 兜底", () => {
    const empty = { ...baseProject, taskCount: 0, incompleteTaskCount: 0, reqCount: 0, planCount: 0, noteCount: 0, fileCount: 0 };
    const wrapper = mount(ProjectCard, { props: { project: empty, setLabel: "" } });
    const text = wrapper.find(".card-stats").text();
    expect(text).toContain("0/0");
    expect(text.match(/\b0\b/g).length).toBeGreaterThanOrEqual(4);
  });
});
