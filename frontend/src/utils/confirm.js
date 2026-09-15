/**
 * 编程式确认弹窗（Promise 化）：confirmDialog(options) → Promise<boolean>
 *
 * - 单例：模块内 createApp 挂载一份 ConfirmModal，之后只切换 props，杜绝多实例取号混乱
 * - 层级：打开时经 zIndex.js 统一计数器取号（topZ+1），与 FloatPanel 同一权威，天然最顶；
 *   遮罩层拦截指针事件，打开期间底层浮动面板无法被点击置顶盖过本弹窗
 * - 兜底：打开后以实况 DOM 为准再校验一次（enforceTop），确认弹窗永远压在所有已开面板上，
 *   不依赖计数器推断（防宿主环境的意外层级）
 * - 语义：点确认 → resolve(true)；取消 / Esc → resolve(false)；遮罩点击不关闭（与原
 *   el-dialog close-on-click-modal=false 语义一致）
 * - 未决保护：上一问未决时再次调用，旧 Promise 作废（resolve(false)）
 */

import { createApp, h, reactive, nextTick } from "vue";
import ConfirmModal from "../components/ConfirmModal.vue";
import { nextZIndex } from "./zIndex.js";

let mounted = false;
let app = null;
let host = null;
let pending = null; // { resolve }

const state = reactive({
  show: false,
  z: 0,
  message: "",
  confirmText: "确认删除",
  cancelText: "取消",
  title: "确认",
});

function settle(value) {
  if (!pending) return;
  const { resolve } = pending;
  pending = null;
  state.show = false;
  resolve(value);
}

function ensureMounted() {
  if (mounted) return;
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({
    render: () =>
      h(ConfirmModal, {
        show: state.show,
        z: state.z,
        message: state.message,
        confirmText: state.confirmText,
        cancelText: state.cancelText,
        title: state.title,
        onConfirm: () => settle(true),
        onClose: () => settle(false),
      }),
  });
  app.mount(host);
  mounted = true;
}

// 兜底：以实况 DOM 为准，确保遮罩在所有已开 FloatPanel 之上（防面板走 fallback 值等意外层级）
function enforceTop() {
  const ov = document.querySelector(".cm-overlay");
  if (!ov) return;
  let max = 0;
  for (const p of document.querySelectorAll(".float-panel")) {
    const z = parseInt(window.getComputedStyle(p).zIndex, 10);
    if (!Number.isNaN(z) && z > max) max = z;
  }
  if (max >= state.z) state.z = max + 1;
}

/**
 * @param {{message: string, confirmText?: string, cancelText?: string, title?: string}} options
 * @returns {Promise<boolean>} true=用户点了确认按钮
 */
export function confirmDialog(options = {}) {
  ensureMounted();
  if (pending) settle(false); // 旧问题未决即作废
  return new Promise((resolve) => {
    pending = { resolve };
    state.message = String(options.message ?? "");
    state.confirmText = options.confirmText ?? "确认删除";
    state.cancelText = options.cancelText ?? "取消";
    state.title = options.title ?? "确认";
    state.show = true;
    nextTick(() => {
      state.z = nextZIndex();
      enforceTop();
    });
  });
}
