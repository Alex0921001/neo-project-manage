/* global hana */

/**
 * multipart 上传（不设 Content-Type，fetch 自动带 boundary）
 * 双模式与 index.js adapter 一致：hana.api.fetch 优先，直连回退
 */
import { apiUrlFor, runtimeSession, withToken, RUNTIME } from "./runtime.js";

const hanaApi = (typeof window !== "undefined" && window.hana?.api) || null;
const surfaceSession = runtimeSession();

export async function apiUpload(path, formData) {
  try {
    if (hanaApi?.fetch) return await hanaApi.fetch(path.replace(/^\/+/, ""), { method: "POST", body: formData });
    const headers = {};
    if (surfaceSession) headers[RUNTIME.sessionHeader] = surfaceSession;
    const res = await fetch(withToken(apiUrlFor(path)), { method: "POST", body: formData, headers });
    return await res.json();
  } catch (err) {
    console.error("上传失败:", path, err);
    return { ok: false, error: err.message };
  }
}
