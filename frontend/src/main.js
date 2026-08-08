import { createApp } from "vue";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "./styles/ep-theme.css";
import "./styles/rich-view.css";
import App from "./App.vue";

// Element Plus 全量中文化（日期选择器等组件语言，P3）
dayjs.locale("zh-cn");

createApp(App).use(ElementPlus, { locale: zhCn }).mount("#app");

// 插件静态文件图片（/api/plugins/.../files/*）在 Hana 网关下需要 session 鉴权，
// <img> 标签无法带自定义 header。方案：fetch 带 session header 取回图片，转 dataURL（CSP img-src 允许 data:）。
// 新上传图片已由 RichEditor 直接转 base64 入库（data: 开头），此处理仅兜底历史数据中的服务器路径图片。
const surfaceSession = new URLSearchParams(window.location.search).get("pluginSurfaceSession");
const imgCache = new Map(); // src → dataURL

async function loadImgWithCredential(img) {
  const src = img.getAttribute("src");
  if (!src || src.startsWith("data:")) return; // base64 已自包含，无需处理
  if (!src.startsWith("/api/plugins/") || !src.includes("/files/")) return;
  if (img.dataset.pmLoaded === "1") return; // 已处理
  if (imgCache.has(src)) {
    img.src = imgCache.get(src);
    img.dataset.pmLoaded = "1";
    return;
  }
  img.dataset.pmLoaded = "1"; // 防并发重复，失败时复位允许重试
  try {
    const headers = {};
    if (surfaceSession) headers["X-Hana-Plugin-Surface-Session"] = surfaceSession;
    const res = await fetch(src, { headers });
    if (!res.ok) {
      console.warn("[neo-pm] 图片加载失败", src, res.status);
      img.dataset.pmLoaded = "0";
      return;
    }
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      imgCache.set(src, dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    console.warn("[neo-pm] 图片加载异常", src, e);
    img.dataset.pmLoaded = "0";
  }
}

function patchPluginImages(root) {
  root.querySelectorAll?.("img[src^=\"/api/plugins/\"]").forEach((img) => loadImgWithCredential(img));
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "childList" && m.addedNodes?.length) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) patchPluginImages(node);
      }
    } else if (m.type === "attributes" && m.target?.nodeType === 1 && m.attributeName === "src") {
      loadImgWithCredential(m.target);
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
