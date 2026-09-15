/**
 * 编程式确认弹窗（Promise 化）：confirmDialog(options) → Promise<boolean>
 *
 * - 单例：模块内 createApp 挂载一份 ConfirmModal，之后只切换 props，杜绝多实例取号混乱
 * - 层级：打开时经 zIndex.js 统一计数器取号（topZ+1），与 FloatPanel 同一权威，天然最顶；
 *   遮罩层拦截指针事件，打开期间底层浮动面板无法被点击置顶盖过本弹窗
 * - 语义：点确认 → resolve(true)；取消 / Esc → resolve(false)；遮罩点击不关闭（与原
 *   el-dialog close-on-click-modal=false 语义一致）
 * - 未决保护：上一问未决时再次调用，旧 Promise 作废（resolve(false)）
 */

import { createApp, h, reactive } from "vue";
import ConfirmModal from "../components/ConfirmModal.vue";

let mounted = false;
let app = null;
let host = null;
let pending = null; // { resolve }

const state = reactive({
  show: false,
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
  });
}
