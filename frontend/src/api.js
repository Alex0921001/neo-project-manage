/* global hana, __BUILD_AT__, __PLUGIN_VERSION__, __PLUGIN_SOURCE__ */
import { ElMessage } from "element-plus";

const BUILD_AT = typeof __BUILD_AT__ !== "undefined" ? __BUILD_AT__ : "dev";
// 编译时静态注入：未重启 Hana 之前的后端 fallback（前端打包时已知后端 version）
const STATIC_VERSION = typeof __PLUGIN_VERSION__ !== "undefined" ? __PLUGIN_VERSION__ : "?";
const STATIC_SOURCE = typeof __PLUGIN_SOURCE__ !== "undefined" ? __PLUGIN_SOURCE__ : "?";

function pluginId() {
  const m = /^\/api\/plugins\/([^/]+)/.exec(window.location.pathname);
  if (!m) throw new Error("Cannot detect plugin id");
  return decodeURIComponent(m[1]);
}

function apiUrl(path) {
  const p = path.replace(/^\/+/, "").replace(/[\\\0#]/g, "");
  return `${window.location.origin}/api/plugins/${pluginId()}/${p}`;
}

const surfaceSession = new URLSearchParams(window.location.search).get("pluginSurfaceSession");

// Hana 平台注入的 iframe API（自动处理凭据）。优先使用，回退手动 session header
const hanaApi = (typeof window !== "undefined" && window.hana?.api) || null;
// 调试：确认运行环境（可删）
console.log("[neo-pm] hana.api 可用:", !!hanaApi, "; surfaceSession:", surfaceSession ? surfaceSession.slice(0, 8) + "..." : "null");

/**
 * 解析插件资源 URL（图片等 <img> 无法带 header）：
 * 优先 hana.api.url（平台自动附加凭据），回退手动附加 pluginSurfaceSession query
 * @param {string} src 原始 URL（相对路径 /api/plugins/... 或完整 URL）
 * @returns {string}
 */
export function resolveAssetUrl(src) {
  if (!src) return src;
  const s = String(src);
  // 非插件资源（http 外部 / data: / blob:）不处理
  if (!s.startsWith("/api/plugins/")) return s;
  try {
    if (hanaApi?.url) return hanaApi.url(s.replace(/^\/api\/plugins\/[^/]+\//, ""));
  } catch (e) {
    console.error("[neo-pm] hana.api.url 失败，回退手动:", e);
  }
  if (!surfaceSession) return s;
  const sep = s.includes("?") ? "&" : "?";
  return `${s}${sep}pluginSurfaceSession=${encodeURIComponent(surfaceSession)}`;
}

export async function api(path, opts = {}) {
  try {
    // 优先 Hana 平台 API（自动处理凭据与路由前缀）
    if (hanaApi?.fetch) return await hanaApi.fetch(path.replace(/^\/+/, ""), opts);
    const headers = { "Content-Type": "application/json", ...opts.headers };
    if (surfaceSession) headers["X-Hana-Plugin-Surface-Session"] = surfaceSession;
    const res = await fetch(apiUrl(path), { ...opts, headers });
    const data = await res.json();
    // v1.3.1：拦截后端业务错误（ok=false），统一弹 ElMessage；调用方传 silent:true 跳过
    // 重复 toast 由 toast.js 内部 600ms 内容去重保护，不会刷屏
    if (data && data.ok === false && !opts.silent) {
      ElMessage.error(data.error || "操作失败");
    }
    return data;
  } catch (err) {
    console.error("API 请求失败:", path, err);
    if (!opts.silent) ElMessage.error(err.message || "网络异常");
    return { ok: false, error: err.message };
  }
}

/**
 * multipart/form-data 上传（不设 Content-Type，fetch 自动带 boundary）
 */
export async function apiUpload(path, formData) {
  try {
    // 优先 Hana 平台 API
    if (hanaApi?.fetch) return await hanaApi.fetch(path.replace(/^\/+/, ""), { method: "POST", body: formData });
    const headers = {};
    if (surfaceSession) headers["X-Hana-Plugin-Surface-Session"] = surfaceSession;
    const res = await fetch(apiUrl(path), { method: "POST", body: formData, headers });
    return await res.json();
  } catch (err) {
    console.error("上传失败:", path, err);
    return { ok: false, error: err.message };
  }
}

export function reportHeight() {
  const h = document.documentElement.scrollHeight;
  if (h > 100) {
    window.parent.postMessage(
      { protocol: "hana.plugin.ui", version: 1, kind: "event", type: "ui.resize", payload: { height: h } },
      "*"
    );
  }
}

export async function getVersion() {
  // 优先调后端 /api/version（拿 loadedAt 等实时信息）
  const res = await api("api/version");
  if (res?.ok) return { ...res.data, frontendBuiltAt: BUILD_AT };
  // Fallback：后端未重启（路由还未重新加载），用静态注入值
  return {
    version: STATIC_VERSION,
    source: STATIC_SOURCE,
    loadedAt: null,
    frontendBuiltAt: BUILD_AT,
    fallback: true,
  };
}
