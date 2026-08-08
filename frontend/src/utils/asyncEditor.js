/**
 * 富文本编辑器异步加载工厂（P3-7）
 * - Tiptap 体积大，拆独立 chunk，异步加载
 * - 带 loading / error 占位与自动重试（chunk 加载失败不再静默空白）
 */
import { defineAsyncComponent } from "vue";

const LOADING_STYLE = "padding:14px;font-size:12px;color:oklch(0.55 0.02 270);background:oklch(0.965 0.006 270);border-radius:8px;";
const ERROR_STYLE = "padding:14px;font-size:12px;color:oklch(0.5 0.18 30);background:oklch(0.96 0.02 30 / 0.4);border-radius:8px;";

const LoadingComponent = {
  template: `<div style="${LOADING_STYLE}">编辑器加载中…</div>`,
};
const ErrorComponent = {
  template: `<div style="${ERROR_STYLE}">编辑器加载失败，请刷新页面重试</div>`,
};

export function createRichEditor() {
  return defineAsyncComponent({
    loader: () => import("../components/RichEditor.vue"),
    loadingComponent: LoadingComponent,
    errorComponent: ErrorComponent,
    timeout: 15000,
    onError(_err, retry, fail, attempts) {
      if (attempts <= 2) retry();
      else fail();
    },
  });
}
