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
          <el-button class="btn-save" :loading="picking" @click="pickFile">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            上传文件
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
        <el-button class="btn-save" :loading="adding" :disabled="!pending.length" @click="confirmAdd">
          添加 {{ pending.length ? `(${pending.length})` : '' }}
        </el-button>
      </template>
    </el-dialog>

    <div class="file-grid">
      <div v-for="f in files" :key="f.id" class="file-chip" title="双击打开" @dblclick="openFile(f)">
        <span class="chip-icon" v-text="iconShort(f.name)"></span>
        <span class="chip-name">{{ f.name }}</span>
        <button class="chip-del" @click.stop="emit('confirm-ask', { message: '确认删除此文件？', action: 'delete-file', payload: f.id })">✕</button>
        <div class="chip-bottom"><span class="chip-date">{{ f.uploadedAt }}</span></div>
      </div>
    </div>
    <div v-if="!files.length" class="files-empty">
      <div class="files-empty-deco">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      </div>
      <p class="files-empty-title">还没有文件</p>
      <p class="files-empty-sub">上传项目相关资料，双击即可打开</p>
      <button class="files-empty-add" @click="openAdd">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>添加第一个文件</span>
      </button>
    </div>
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
  toast("正在打开系统文件选择窗口，请留意弹窗", "warn");
  let res = null;
  const warnTimer = setTimeout(() => {
    if (picking.value) toast("如果系统弹窗已打开，请完成选择；否则请重试", "warn");
  }, 12000);
  try {
    res = await api("api/pick-file");
  } catch (err) {
    res = { ok: false, error: err.message };
  } finally {
    clearTimeout(warnTimer);
    picking.value = false;
  }
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
  border-radius: 5px; font-size: 10px; font-weight: 700; color: var(--text-secondary);
  letter-spacing: 0.2px; grid-row: 1; grid-column: 1;
  background: var(--bg-hover);
}
/* 文件类型图标统一黑白灰（不再按类型着色） */
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
.chip-del:hover { opacity: 1 !important; background: var(--bg-hover); color: var(--danger); }

/* 空态：与备注对齐 */
.files-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  gap: 6px;
}
.files-empty-deco {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-hover);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.files-empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.files-empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.files-empty-add {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--text);
  border-radius: var(--radius-md);
  background: var(--text);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--duration-fast) var(--ease-out);
  box-shadow: var(--shadow-sm);
}
.files-empty-add:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  box-shadow: var(--shadow-md);
}

.pick-hint {
  flex-basis: 100%;
  margin-top: 8px;
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
.pending-del:hover { color: var(--danger); background: var(--bg-hover); }
.pending-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
