/**
 * 富文本图片点击预览（配合 el-image-viewer）
 * 用法：
 *   const { viewerVisible, viewerSrc, onRichClick } = useRichImagePreview();
 *   <div v-html="..." @click="onRichClick"></div>
 *   <el-image-viewer v-if="viewerVisible" :url-list="[viewerSrc]" @close="viewerVisible = false" />
 */
import { ref } from "vue";

export function useRichImagePreview() {
  const viewerVisible = ref(false);
  const viewerSrc = ref("");

  function onRichClick(e) {
    const t = e.target;
    if (t && t.tagName === "IMG") {
      viewerSrc.value = t.currentSrc || t.src || "";
      if (viewerSrc.value) viewerVisible.value = true;
    }
  }

  return { viewerVisible, viewerSrc, onRichClick };
}
