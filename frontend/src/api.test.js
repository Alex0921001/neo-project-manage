import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// api.js 依赖 element-plus 的 ElMessage，mock 掉避免真实加载
vi.mock("element-plus", () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
}));

// 模拟插件页面 URL（带 token）：必须在 import api.js 前设置（模块级读取 location）
window.history.replaceState(null, "", "/api/plugins/neo-project-manage/page?token=TESTTOKEN123");

const { api } = await import("./api.js");

describe("api.js token 附加（直连模式）", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("URL 带 token 时请求自动附加 token 参数", async () => {
    const mockFetch = vi.fn(async (url) => ({ ok: true, json: async () => ({ ok: true, data: {} }) }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await api("api/projects", { silent: true });
    expect(res.ok).toBe(true);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/plugins/neo-project-manage/api/projects");
    expect(url).toContain("token=TESTTOKEN123");
  });

  it("后端 ok=false 且未 silent 时弹错误 toast", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, error: "业务错误" }) }));
    vi.stubGlobal("fetch", mockFetch);

    await api("api/projects");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("业务错误");
  });
});
