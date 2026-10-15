/**
 * 运行环境探测：同一份前端产物同时支持 v1 插件与 v2 App 两种宿主形态。
 *
 * v1 插件：iframe 路径 /api/plugins/<id>/…，API 前缀同路径，凭据 query pluginSurfaceSession +
 *          header X-Hana-Plugin-Surface-Session
 * v2 App：iframe 路径 /api/apps/<id>/ui/…，API 前缀 /api/apps/<id>/routes/，
 *          凭据 query appSurfaceSession + header X-Hana-App-Surface-Session
 *
 * 前端所有请求与图片资源都经这里拼前缀，避免散落的硬编码。
 */

function detect() {
  if (typeof window === "undefined" || !window.location) {
    return fallback();
  }
  const pathname = window.location.pathname || "";

  const app = /^\/api\/apps\/([^/]+)\/ui(?:\/|$)/.exec(pathname);
  if (app) {
    const raw = app[1];
    const prefix = `/api/apps/${raw}/routes/`;
    return {
      mode: "v2",
      id: decodeURIComponent(raw),
      apiPrefix: prefix,
      assetPrefix: prefix,
      sessionQuery: "appSurfaceSession",
      sessionHeader: "X-Hana-App-Surface-Session",
    };
  }

  const plugin = /^\/api\/plugins\/([^/]+)/.exec(pathname);
  if (plugin) {
    const raw = plugin[1];
    const prefix = `/api/plugins/${raw}/`;
    return {
      mode: "v1",
      id: decodeURIComponent(raw),
      apiPrefix: prefix,
      assetPrefix: prefix,
      sessionQuery: "pluginSurfaceSession",
      sessionHeader: "X-Hana-Plugin-Surface-Session",
    };
  }

  return fallback();
}

/** 未知形态兜底（本地预览 / 单测）：保持旧 v1 行为 */
function fallback() {
  return {
    mode: "unknown",
    id: "neo-project-manage",
    apiPrefix: "/api/plugins/neo-project-manage/",
    assetPrefix: "/api/plugins/neo-project-manage/",
    sessionQuery: "pluginSurfaceSession",
    sessionHeader: "X-Hana-Plugin-Surface-Session",
  };
}

export const RUNTIME = detect();

export function pluginId() {
  return RUNTIME.id;
}

export function isV2() {
  return RUNTIME.mode === "v2";
}

/** 当前宿主下发的 surface session（无则 null） */
export function runtimeSession() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(RUNTIME.sessionQuery);
}

/** 业务 API 全量 URL（相对路径自动补前缀） */
export function apiUrlFor(path) {
  const p = String(path).replace(/^\/+/, "").replace(/[\\\0#]/g, "");
  return `${window.location.origin}${RUNTIME.apiPrefix}${p}`;
}

/** 静态资源全量 URL（相对路径自动补前缀） */
export function assetUrlFor(rel) {
  const p = String(rel).replace(/^\/+/, "");
  return `${window.location.origin}${RUNTIME.assetPrefix}${p}`;
}

/** 直连模式：URL 带 token 时自动附加（宿主 iframe 内无 token，不生效） */
export function urlToken() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export function withToken(url) {
  const t = urlToken();
  if (!t) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(t)}`;
}
