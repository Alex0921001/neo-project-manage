<template>
  <div class="area-section">
    <!-- 添加文件弹窗：桌面集成（选择本地文件路径） -->
    <el-dialog
      v-model="dialogShow"
      title="添加文件"
      width="480px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="选择本地文件">
          <el-button type="primary" plain :loading="picking" @click="pickFile">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            选择本地文件（可多选）
          </el-button>
          <div class="pick-hint">支持任意文件类型，添加后可双击打开</div>
        </el-form-item>
        <el-form-item v-if="pending.length" label="已选择">
          <div class="pending-list">
            <div v-for="(p, i) in pending" :key="p + '_' + i" class="pending-item">
              <span class="pending-name" :title="p">{{ fileName(p) }}</span>
              <button class="pending-del" @click="pending.splice(i, 1)">✕</button>
            </div>
          </div>
        </el-form-item>
        <el-form-item v-else label="已选择">
          <span class="pending-empty">尚未选择文件</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogShow = false">取消</el-button>
        <el-button type="primary" :loading="adding" :disabled="!pending.length" @click="confirmAdd">
          添加 {{ pending.length ? `(${pending.length})` : '' }}
        </el-button>
      </template>
    </el-dialog>

    <div class="file-grid">
      <div v-for="f in files" :key="f.id" class="file-chip" title="双击打开" @dblclick="openFile(f)">
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

const dialogShow = ref(false);
const picking = ref(false);
const adding = ref(false);
const pending = ref([]);

function fileName(p) {
  return p.split(/[\\/]/).pop() || p;
}

function openAdd() {
  pending.value = [];
  dialogShow.value = true;
}

async function pickFile() {
  if (picking.value) return;
  picking.value = true;
  const res = await api("api/pick-file");
  picking.value = false;
  if (res?.ok && res.paths?.length > 0) {
    for (const p of res.paths) {
      if (p.trim() && !pending.value.includes(p)) pending.value.push(p);
    }
  } else {
    toast(res?.error || "未选择文件", "error");
  }
}

async function confirmAdd() {
  if (!pending.value.length) return;
  adding.value = true;
  const results = [];
  for (const p of pending.value) {
    const res = await api(`api/projects/${props.projectId}/files`, { method: "POST", body: JSON.stringify({ path: p }) });
    results.push(!!res.ok);
  }
  adding.value = false;
  const okCount = results.filter(Boolean).length;
  toast(okCount ? `已添加 ${okCount} 个文件` : "添加失败", okCount ? "success" : "error");
  if (okCount) { dialogShow.value = false; pending.value = []; emit("changed"); }
}

async function openFile(f) {
  if (!f.path) { toast("无文件路径", "error"); return; }
  const res = await api(`api/open-file?path=${encodeURIComponent(f.path)}`);
  if (!res?.ok) toast(res?.error || "打开文件失败", "error");
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

defineExpose({ openAdd, pickFile: openAdd });
</script>

<style scoped>
.area-section { margin-bottom: 24px; }
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

.pick-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.pending-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
}
.pending-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-card);
}
.pending-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text);
}
.pending-del {
  width: 18px; height: 18px;
  border: none; background: transparent;
  color: var(--text-tertiary);
  font-size: 12px; line-height: 1;
  cursor: pointer; border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.15s;
}
.pending-del:hover { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
.pending-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
