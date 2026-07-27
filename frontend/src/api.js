/* global hana */

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
