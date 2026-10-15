import fs from "node:fs";

/**
 * v2 App 运行在 Node Permission Model 下：许可根只有「安装目录（只读）」与
 * app-data（可写）。对用户工作区等根外路径调用裸 fs 会抛
 * ERR_ACCESS_DENIED（"Access to this API has been restricted..."），
 * 而不是像 v1 那样安静地返回 false。
 *
 * 这里统一兜住这类调用：把「不可访问」降级为布尔/空值，避免一个路径检查
 * 把整条接口打成 400。
 *
 * 注意：这不是恢复读权限，只是让调用方拿到确定结论。需要在 v2 里真正读取
 * 工作区文件时，走宿主的 ResourceIO（ctx.resources，ref=local-file）。
 */

/** 是否可访问（许可根外一律 false，不抛错） */
export function existsSafe(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** 读 stat，失败返回 null */
export function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** 读文件，返回 { ok, data?, error? }；权限拒绝给出可读文案 */
export function readFileSafe(p, encoding) {
  try {
    return { ok: true, data: fs.readFileSync(p, encoding) };
  } catch (e) {
    const denied = e && (e.code === "ERR_ACCESS_DENIED" || /restricted|allow-fs/i.test(e.message || ""));
    return { ok: false, error: denied ? "路径不在应用可读范围内" : e.message };
  }
}
