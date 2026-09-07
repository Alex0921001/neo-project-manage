import { describe, it, expect, vi, beforeEach } from "vitest";

// api/index.js 依赖 element-plus 的 ElMessage，mock 掉避免真实加载
vi.mock("element-plus", () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
}));

// 模拟插件页面 URL（带 token）：必须在 import 前设置（模块级读取 location）
window.history.replaceState(null, "", "/api/plugins/neo-project-manage/page?token=TESTTOKEN123");

const { default: http } = await import("./api/index.js");

beforeEach(async () => {
  const { ElMessage } = await import("element-plus");
  ElMessage.error.mockClear();
});

describe("http（axios adapter 直连模式）", () => {
  it("URL 补全插件前缀 + token 自动附加 + params 序列化", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await http.get("api/projects", { params: { keyword: "x y", status: "" }, silent: true });
    expect(res.ok).toBe(true);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/plugins/neo-project-manage/api/projects");
    expect(url).toContain("token=TESTTOKEN123");
    expect(url).toContain("keyword=x+y");
    expect(url).not.toContain("status=");
  });

  it("GET 请求不带 body；头含 Content-Type 由 adapter 设置", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) }));
    vi.stubGlobal("fetch", mockFetch);

    await http.get("api/members", { silent: true });
    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("POST 对象 body 序列化为 JSON 字符串", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) }));
    vi.stubGlobal("fetch", mockFetch);

    await http.post("api/members", { name: "张三" }, { silent: true });
    const init = mockFetch.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"name":"张三"}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("后端 ok=false 且未 silent 时弹错误 toast，拦截器解包业务 JSON", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, error: "业务错误" }) }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await http.get("api/projects");
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("业务错误");
    expect(res).toEqual({ ok: false, error: "业务错误" });
  });

  it("silent: true 时 ok=false 不弹 toast", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, error: "静默错误" }) }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await http.get("api/projects", { silent: true });
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });
});
