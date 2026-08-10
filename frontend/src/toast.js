import { ElMessage } from "element-plus";

// v1.3.1：用 Element Plus ElMessage 替代底部红色浮窗，外观更柔和、支持分组去重
const _last = { key: "", at: 0 };

/**
 * 统一提示（success/error/warning/info）
 * - 同消息在 600ms 内只弹一次（避免 api 拦截 + 调用方重复弹）
 * - error 类型延长显示时间（4s）+ 显示关闭按钮
 * @param {string} msg
 * @param {"success"|"error"|"warn"|"warning"|"info"} type
 */
export function toast(msg, type = "success") {
  if (!msg) return;
  const k = `${type}:${msg}`;
  const now = Date.now();
  if (_last.key === k && now - _last.at < 600) return;
  _last.key = k;
  _last.at = now;

  const epType = type === "warn" ? "warning" : type;
  ElMessage({
    message: msg,
    type: epType,
    showClose: type === "error",
    duration: type === "error" ? 4000 : 2000,
    grouping: false,  // v1.3.1：关掉合并计数，避免右上角显示 "2"
  });
}