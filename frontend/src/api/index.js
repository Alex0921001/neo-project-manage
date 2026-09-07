/* global hana */
import axios from "axios";
import { ElMessage } from "element-plus";

/**
 * axios 实例与 Hana 凭据 adapter（V2.6.4 需求 b11fb230 / 任务 818c9917）
 *
 * 双模式请求链路：
 * - 宿主 iframe：window.hana.api.fetch 优先（平台自动处理凭据与路由前缀）
 * - 直连：surfaceSession header + urlToken query + apiUrl 前缀补全
 *
 * 响应约定：后端业务 JSON { ok, data?, error? }；拦截器解包后直接返回业务数据，
 * 与旧 api()（src/api.js）返回形态一致，调用方迁移时零逻辑改动。
 * ok=false 统一弹 ElMessage（config.silent 跳过）；网络异常返回 { ok:false, error }。
 */

function pluginId() {
  const m = /^\/api\/plugins\/([^/]+)/.exec(window.location.pathname);
  if (!m) throw new Error("Cannot detect plugin id");
  return decodeURIComponent(m[1]);
}

function apiUrl(path) {
  const p = String(path).replace(/^\/+/, "").replace(/[\\\0#]/g, "");
  return `${window.location.origin}/api/plugins/${pluginId()}/${p}`;
}

// 直连模式：URL 带 token 时自动附加到所有请求（宿主 iframe 内无 token 参数，不生效）
const urlToken = new URLSearchParams(window.location.search).get("token");
function withToken(url) {
  if (!urlToken) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(urlToken)}`;
}

// Hana 平台注入的 iframe API（自动处理凭据）。直连模式为 null，走 fetch 回退
const hanaApi = (typeof window !== "undefined" && window.hana?.api) || null;
const surfaceSession = new URLSearchParams(window.location.search).get("pluginSurfaceSession");

/** axios config.url + params → 完整请求 URL（相对路径按插件 API 前缀补全） */
function buildUrl(config) {
  let p = config.url || "";
  if (!/^https?:\/\//.test(p)) p = apiUrl(p);
  if (config.params) {
    const qs = new URLSearchParams(
      Object.entries(config.params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    if (qs) p += (p.includes("?") ? "&" : "?") + qs;
  }
  return p;
}

/** 请求体序列化：对象 → JSON 字符串（FormData 等非 JSON 类型直接透传） */
function serializeBody(config) {
  if (config.data == null) return undefined;
  if (typeof config.data === "string") return config.data;
  if (config.data instanceof FormData) return config.data;
  return JSON.stringify(config.data);
}

/** 头对象归一：axios AxiosHeaders → 普通对象 */
function plainHeaders(config) {
  const out = {};
  if (config.headers) {
    for (const [k, v] of Object.entries(config.headers.toJSON ? config.headers.toJSON() : config.headers)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/** 自定义 adapter：宿主 hana.api.fetch 优先，直连 fetch 回退；返回 axios response 形态 */
async function hanaAdapter(config) {
  const method = String(config.method || "get").toUpperCase();
  const headers = plainHeaders(config);
  const url = buildUrl(config);
  let body = serializeBody(config);
  if (body instanceof FormData) {
    // FormData 不设 Content-Type，fetch 自动带 boundary
    delete headers["Content-Type"];
  } else if (body != null) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  let data;
  if (hanaApi?.fetch) {
    const opts = { method, headers };
    if (body != null) opts.body = body;
    data = await hanaApi.fetch(config.url.replace(/^\/+/, ""), opts);
    return { data, status: 200, statusText: "OK", headers: {}, config, request: null };
  }

  if (surfaceSession) headers["X-Hana-Plugin-Surface-Session"] = surfaceSession;
  const res = await fetch(withToken(url), { method, headers, body });
  data = await res.json();
  return { data, status: res.status, statusText: res.statusText, headers: {}, config, request: null };
}

const http = axios.create({
  adapter: hanaAdapter,
  // 自定义 adapter 下 axios 不再做浏览器特有处理，超时/重试按需在模块层加
});

http.interceptors.response.use(
  (res) => {
    const d = res.data;
    // 拦截后端业务错误（ok=false），统一弹 ElMessage；调用方传 silent 跳过。
    // 重复 toast 由 toast.js 内部去重保护，不刷屏
    if (d && d.ok === false && !res.config.silent) {
      ElMessage.error(d.error || "操作失败");
    }
    return d;
  },
  (err) => {
    console.error("API 请求失败:", err.config?.url, err);
    if (!err.config?.silent) ElMessage.error(err.message || "网络异常");
    return { ok: false, error: err.message || "网络异常" };
  },
);

export default http;
