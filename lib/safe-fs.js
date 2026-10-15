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
 * 真正需要读内容时，走 lib/host-fs.js（宿主 ResourceIO）。
 */

/** 是否属于「权限拒绝」类错误 */
export function isDenied(e) {
  return !!e && (e.code === "ERR_ACCESS_DENIED" || /restricted|allow-fs/i.test(String(e.message || "")));
}

/**
 * 三态存在性：true=存在 / false=确定不存在 / null=无权访问（无法判定）
 * 返回 null 而不是 false，避免 UI 把「读不到」误报成「路径失效」。
 */
export function existsSafe(p) {
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch (e) {
    return isDenied(e) ? null : false;
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
    return { ok: false, error: isDenied(e) ? "路径不在应用可读范围内" : e.message };
  }
}
