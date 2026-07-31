/* global hana, __BUILD_AT__, __PLUGIN_VERSION__, __PLUGIN_SOURCE__ */

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

export async function api(path, opts = {}) {
  try {
    const headers = { "Content-Type": "application/json", ...opts.headers };
    if (surfaceSession) headers["X-Hana-Plugin-Surface-Session"] = surfaceSession;
    const res = await fetch(apiUrl(path), { ...opts, headers });
    return await res.json();
  } catch (err) {
    console.error("API 请求失败:", path, err);
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
