<template>
  <div class="area-section">
    <div class="file-grid">
      <div v-for="f in files" :key="f.id" class="file-chip" @dblclick="openFile(f)">
        <span class="chip-icon" :class="'chip-'+iconClass(f.name)" v-text="iconShort(f.name)"></span>
        <span class="chip-name">{{ f.name }}</span>
        <button class="chip-del" @click.stop="emit('confirm-ask', { message: '确认删除此文件？', action: 'delete-file', payload: f.id })">✕</button>
        <div class="chip-bottom"><span class="chip-date">{{ f.uploadedAt }}</span></div>
      </div>
    </div>
    <div v-if="!files.length" class="empty-state">暂无文件</div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { api } from "../../../api.js";
import { toast } from "../../../toast.js";

const props = defineProps({
  projectId: String,
  files: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed", "confirm-ask"]);

const uploading = ref(false);

function pickFile() {
  if (uploading.value) return;
  uploading.value = true;
  api("api/pick-file").then(res => {
    if (res?.ok && res.paths?.length > 0) {
      Promise.all(res.paths.map(p => addFileByPath(p))).then(results => {
        toast(`已添加 ${results.filter(r => r).length} 个文件`);
        emit("changed");
        uploading.value = false;
      });
    } else {
      toast(res?.error || "未选择文件", "error");
      uploading.value = false;
    }
  }).catch(() => { uploading.value = false; });
}

async function addFileByPath(filePath) {
  if (!filePath.trim()) return false;
  const res = await api(`api/projects/${props.projectId}/files`, { method: "POST", body: JSON.stringify({ path: filePath }) });
  return !!res.ok;
}

function openFile(f) {
  if (!f.path) { toast("无文件路径", "error"); return; }
  api(`api/open-file?path=${encodeURIComponent(f.path)}`);
}

function iconClass(name) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  const map = { pdf: "pdf", doc: "doc", docx: "doc", xls: "xls", xlsx: "xls", ppt: "ppt", pptx: "ppt", txt: "txt", md: "md", jpg: "img", jpeg: "img", png: "img", gif: "img", webp: "img", svg: "img", mp4: "vid", mov: "vid", avi: "vid", mkv: "vid", mp3: "aud", wav: "aud", flac: "aud", ogg: "aud", zip: "arc", rar: "arc", "7z": "arc", json: "code", js: "code", css: "code", html: "code", xml: "code", yaml: "code", toml: "code", csv: "data" };
  return map[ext] || "file";
}
function iconShort(name) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  const map = { doc: "doc", docx: "doc", xls: "xls", xlsx: "xls", ppt: "ppt", pptx: "ppt", jpg: "img", jpeg: "img", png: "img", gif: "img", webp: "img", svg: "img", mp4: "vid", mov: "vid", avi: "vid", mkv: "vid", mp3: "aud", wav: "aud", flac: "aud", zip: "zip", rar: "rar", "7z": "7z", csv: "csv", js: "js", css: "css", html: "htm", xml: "xml", json: "jn", yaml: "yml", toml: "tml" };
  return map[ext] || ext?.toUpperCase() || "";
}

defineExpose({ pickFile });
</script>

<style scoped>
.area-section { margin-bottom: 24px; }
.area-header { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 10px; }
.file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(max(160px, calc((100% - 40px) / 5)), 1fr)); gap: 10px; }
.file-chip {
  display: grid; grid-template-columns: 28px 1fr auto; grid-template-rows: auto auto; gap: 4px 8px;
  align-items: center; padding: 14px 16px;
  border: 1px solid var(--border-light); border-radius: var(--radius-lg);
  background: var(--bg-card); cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  position: relative; box-shadow: var(--shadow-sm);
}
.file-chip:hover { border-color: var(--border); box-shadow: var(--shadow-md); }
.chip-icon {
  width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 5px; font-size: 10px; font-weight: 700; color: #fff;
  letter-spacing: 0.2px; grid-row: 1; grid-column: 1;
}
.chip-pdf { background: #e74c3c; } .chip-doc { background: #2b6db0; }
.chip-xls { background: #27ae60; } .chip-ppt { background: #d35400; }
.chip-txt { background: #7f8c8d; } .chip-md { background: #3498db; }
.chip-img { background: #8e44ad; } .chip-vid { background: #e67e22; }
.chip-aud { background: #1abc9c; } .chip-arc { background: #f39c12; }
.chip-code { background: #2c3e50; } .chip-data { background: #16a085; }
.chip-file { background: #95a5a6; }
.chip-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
.chip-bottom { display: flex; justify-content: space-between; align-items: center; padding-left: 34px; }
.chip-date { color: var(--text-tertiary); font-size: 12px; white-space: nowrap; }
.chip-del {
  width: 22px; height: 22px; border: none; border-radius: 4px; background: transparent;
  cursor: pointer; font-size: 13px; line-height: 1; color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--duration-fast) var(--ease-out); opacity: 0;
  grid-row: 1; grid-column: 3;
}
.file-chip:hover .chip-del { opacity: 0.6; }
.chip-del:hover { opacity: 1 !important; background: oklch(0.93 0.05 30 / 0.3); color: oklch(0.5 0.18 30); }
</style>
