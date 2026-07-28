<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal modal-wide">
      <header class="modal-head">
        <h3>{{ isEdit ? '编辑项目' : '新建项目' }}</h3>
        <button class="close-btn" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      </header>

      <form class="form" @submit.prevent="submit">
        <!-- 基本信息 -->
        <section class="form-section">
          <div class="form-section-title">基本信息</div>

          <label class="lbl">
            <span>名称</span>
            <span class="char-count" :class="{ warn: form.name.length >= 18 }">{{ form.name.length }}/20</span>
          </label>
          <input v-model="form.name" type="text" placeholder="项目名称" maxlength="20"
                 :class="{ err: submitErr && !form.name.trim() }">
          <p v-if="submitErr && !form.name.trim()" class="field-err">请填写项目名称</p>

          <label class="lbl">
            <span>描述</span>
            <span class="char-count" :class="{ warn: form.description.length >= 45 }">{{ form.description.length }}/50</span>
          </label>
          <textarea v-model="form.description" placeholder="一句话描述项目目标（可选）" maxlength="50" rows="2"></textarea>
        </section>

        <!-- 时间安排 -->
        <section class="form-section">
          <div class="form-section-title">时间安排</div>
          <div class="date-row">
            <div class="date-field">
              <label class="lbl"><span>计划开始</span></label>
              <input v-model="form.planStart" type="date">
            </div>
            <div class="date-sep">→</div>
            <div class="date-field">
              <label class="lbl"><span>计划结束</span></label>
              <input v-model="form.planEnd" type="date">
            </div>
          </div>
          <p v-if="dateRangeErr" class="field-err">结束日期不能早于开始日期</p>
        </section>

        <!-- 归属 -->
        <section class="form-section">
          <div class="form-section-title">归属</div>

          <div class="form-row">
            <div>
              <label class="lbl"><span>状态</span></label>
              <select v-model="form.status" class="select-status" :class="`select-${form.status}`">
                <option value="待开始">待开始</option>
                <option value="进行中">进行中</option>
                <option value="已完成">已完成</option>
              </select>
            </div>
            <div>
              <label class="lbl required"><span>项目集</span></label>
              <select v-model="form.projectSetId" :class="{ err: submitErr && !form.projectSetId }">
                <option value="">请选择项目集</option>
                <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <p v-if="submitErr && !form.projectSetId" class="field-err">请选择项目集</p>
            </div>
          </div>

          <label class="lbl" style="margin-top:14px"><span>成员</span><span class="char-hint">输入姓名后回车或点击添加</span></label>
          <div class="member-input">
            <input v-model="memberDraft" type="text" placeholder="例如:张三"
                   @keydown.enter.prevent="commitMember"
                   @keydown="onMemberKeydown"
                   @blur="commitMember">
            <button type="button" class="member-add-btn" @click="commitMember">添加</button>
          </div>
          <div v-if="membersList.length" class="member-chips">
            <span v-for="(m, i) in membersList" :key="m + '_' + i" class="member-chip">
              <span class="chip-avatar">{{ m.slice(0, 1) }}</span>
              <span>{{ m }}</span>
              <button type="button" class="chip-x" aria-label="移除" @click="removeMember(i)">×</button>
            </span>
          </div>
          <p v-else class="member-empty">暂未添加成员</p>
        </section>
      </form>

      <footer class="modal-actions">
        <button type="button" class="btn-secondary" @click="$emit('close')">取消</button>
        <button type="button" class="btn-primary" @click="submit">{{ isEdit ? '保存' : '创建' }}</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";

const props = defineProps({
  show: Boolean,
  mode: { type: String, default: "create" }, // "create" | "edit"
  data: { type: Object, default: null },
  defaultSetId: { type: String, default: "" },
  sets: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "save"]);

const isEdit = computed(() => props.mode === "edit");

const form = reactive({
  id: "", name: "", description: "", planStart: "", planEnd: "",
  status: "待开始", projectSetId: "", membersText: "",
});
const memberDraft = ref("");
const submitErr = ref(false);

// 解析当前成员列表（同时支持中英文逗号）
const membersList = computed(() =>
  form.membersText.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
);

// 日期范围校验
const dateRangeErr = computed(() => {
  if (!form.planStart || !form.planEnd) return false;
  return form.planEnd < form.planStart;
});

function commitMember() {
  const text = memberDraft.value;
  const trimmed = text.trim();
  if (!trimmed) {
    memberDraft.value = "";
    return;
  }
  const names = trimmed.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const existing = membersList.value.slice();
  let changed = false;
  for (const n of names) {
    if (!existing.includes(n)) {
      existing.push(n);
      changed = true;
    }
  }
  if (changed) form.membersText = existing.join(", ");
  memberDraft.value = "";
}

function onMemberKeydown(e) {
  if (e.key === "," || e.key === "，" || e.key === "Enter") {
    e.preventDefault();
    commitMember();
  }
}

function removeMember(idx) {
  const list = membersList.value.slice();
  list.splice(idx, 1);
  form.membersText = list.join(", ");
}

watch(() => props.show, (v) => {
  if (v) {
    if (isEdit.value && props.data) {
      const d = props.data;
      form.id = d.id;
      form.name = d.name;
      form.description = d.description || "";
      form.planStart = d.planStart || "";
      form.planEnd = d.planEnd || "";
      // 防御：状态不在三个合法选项内时 fallback 到 "待开始"，避免 select 显示空白
      form.status = ["待开始", "进行中", "已完成"].includes(d.status) ? d.status : "待开始";
      form.projectSetId = d.projectSetId || "";
      form.membersText = (d.members || []).join(", ");
    } else {
      form.id = "";
      form.name = "";
      form.description = "";
      form.planStart = "";
      form.planEnd = "";
      form.status = "待开始";
      form.projectSetId = props.defaultSetId;
      form.membersText = "";
    }
    memberDraft.value = "";
    submitErr.value = false;
  }
});

function submit() {
  if (!form.name.trim() || !form.projectSetId || dateRangeErr.value) {
    submitErr.value = true;
    return;
  }
  // 提交前再 commit 一次（处理用户输入但未按添加的情况）
  commitMember();
  emit("save", {
    id: form.id,
    name: form.name.trim(),
    description: form.description.trim(),
    planStart: form.planStart,
    planEnd: form.planEnd,
    status: form.status,
    projectSetId: form.projectSetId,
    members: membersList.value,
  });
}
</script>

<style scoped>
/* ===== Modal 容器 ===== */
.modal-wide {
  max-width: 640px;
  width: 92%;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px 14px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}
.modal-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.close-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  border: none; background: transparent;
  color: #6b7280; font-size: 22px; line-height: 1;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.close-btn:hover { background: #f3f4f6; color: #111827; }

/* ===== Form 滚动区 ===== */
.form {
  padding: 18px 24px 22px;
  overflow-y: auto;
  flex: 1;
}

.form-section {
  margin-bottom: 22px;
}
.form-section:last-child { margin-bottom: 0; }

.form-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e5e7eb;
}

/* ===== Label / 输入框 ===== */
.lbl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}
.required > span:first-child::after {
  content: ' *';
  color: #ef4444;
}

.char-count {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
.char-count.warn {
  color: #f59e0b;
}
.char-hint {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

input[type="text"],
input[type="date"],
textarea,
select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  color: #1f2937;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  margin-bottom: 12px;
}
textarea {
  resize: vertical;
  min-height: 56px;
  font-family: inherit;
}
input:focus, textarea:focus, select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
input.err, select.err {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.08);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-row > div { display: flex; flex-direction: column; }
.form-row input, .form-row select { margin-bottom: 0; }

/* ===== 日期行（带 → 分隔） ===== */
.date-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 10px;
  align-items: end;
}
.date-field { display: flex; flex-direction: column; }
.date-field input { margin-bottom: 0; }
.date-sep {
  padding-bottom: 10px;
  color: #9ca3af;
  font-size: 16px;
  text-align: center;
  user-select: none;
}

/* ===== 状态下拉：选中项带状态色 ===== */
.select-status {
  font-weight: 500;
}
.select-status.select-待开始 { color: #92400e; }
.select-status.select-进行中 { color: #1e40af; }
.select-status.select-已完成 { color: #065f46; }

/* ===== 成员 chips ===== */
.member-input {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.member-input input { margin-bottom: 0; }
.member-add-btn {
  flex-shrink: 0;
  padding: 0 18px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #374151;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.member-add-btn:hover {
  background: #e5e7eb;
  border-color: #9ca3af;
}

.member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.member-empty {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}
.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 4px;
  background: #eff6ff;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  color: #1e40af;
  border: 1px solid #bfdbfe;
  max-width: 180px;
}
.chip-avatar {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-size: 11px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.member-chip > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-x {
  width: 18px; height: 18px;
  border: none; background: transparent;
  color: #6b7280; font-size: 14px; line-height: 1;
  cursor: pointer; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  margin-right: 2px;
  transition: background 0.15s, color 0.15s;
}
.chip-x:hover { background: rgba(239, 68, 68, 0.15); color: #dc2626; }

/* ===== Footer ===== */
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px 16px;
  border-top: 1px solid #e5e7eb;
  background: #fafbfc;
}
.btn-secondary, .btn-primary {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-secondary {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
}
.btn-secondary:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}
.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: 1px solid #2563eb;
  color: #fff;
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.2);
}
.btn-primary:hover {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border-color: #1d4ed8;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}
.btn-primary:active { transform: translateY(0.5px); }

/* ===== Errors ===== */
.field-err {
  margin: -8px 0 12px;
  font-size: 12px;
  color: #dc2626;
}
</style>
