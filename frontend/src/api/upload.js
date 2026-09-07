/* global hana */

/**
 * multipart 上传（不设 Content-Type，fetch 自动带 boundary）
 * 双模式与 index.js adapter 一致：hana.api.fetch 优先，直连回退
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

const urlToken = new URLSearchParams(window.location.search).get("token");
function withToken(url) {
  if (!urlToken) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(urlToken)}`;
}

const hanaApi = (typeof window !== "undefined" && window.hana?.api) || null;
const surfaceSession = new URLSearchParams(window.location.search).get("pluginSurfaceSession");

export async function apiUpload(path, formData) {
  try {
    if (hanaApi?.fetch) return await hanaApi.fetch(path.replace(/^\/+/, ""), { method: "POST", body: formData });
    const headers = {};
    if (surfaceSession) headers["X-Hana-Plugin-Surface-Session"] = surfaceSession;
    const res = await fetch(withToken(apiUrl(path)), { method: "POST", body: formData, headers });
    return await res.json();
  } catch (err) {
    console.error("上传失败:", path, err);
    return { ok: false, error: err.message };
  }
}
