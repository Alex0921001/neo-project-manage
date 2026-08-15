<template>
  <section class="overview-card" :class="{ 'ov-collapsed': !expanded }">
    <!-- 头部：左右两个平级标题块（项目概览 | 历史总结） -->
    <div class="ov-cols-head">
      <!-- 左标题：项目概览（点击折叠） -->
      <div class="ov-head ov-head-main" @click="expanded = !expanded">
        <svg class="ov-chevron" :class="{ rotated: expanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="ov-title">项目概览</span>
        <span class="ov-spacer"></span>
        <button class="ov-refresh" title="一键生成周报/阶段总结" @click.stop="openReport">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          生成周报
        </button>
        <button class="ov-refresh" :class="{ spinning: loading }" title="刷新总结" @click.stop="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          刷新总结
        </button>
      </div>
      <!-- 右标题：历史总结（始终显示，无数据时列内显示 el-empty） -->
      <div class="ov-head ov-head-tl">
        <span class="ov-tl-title">历史总结</span>
        <span v-if="summaries.length" class="ov-tl-count">{{ summaries.length }}</span>
        <span class="ov-tl-spacer"></span>
        <button v-if="summaries.length > TL_LIMIT" class="ov-tl-more" @click="drawerOpen = true">更多 ></button>
      </div>
    </div>

    <div v-show="expanded" class="ov-body">
      <div v-if="loading" class="ov-empty">正在生成总结…</div>
      <div v-else-if="!s" class="ov-empty">暂无数据</div>

      <div v-else class="ov-cols ov-cols-4">
        <!-- 空项目引导：独占整行 -->
        <template v-if="isEmpty">
          <div class="ov-col ov-col-empty">
            <p class="ov-empty-text">还没有任务，拆解项目开始规划</p>
            <ul v-if="s.nextSteps?.length" class="ov-steps ov-steps-empty">
              <li v-for="(st, i) in s.nextSteps" :key="i">{{ st }}</li>
            </ul>
          </div>
        </template>

        <template v-else>
          <!-- 列 1：KPI 四宫格（白底便利贴） -->
          <div class="ov-col">
            <div class="ov-kpi-frame">
              <div class="ov-kpi-tape"></div>
              <div class="ov-kpis">
                <!-- 剩余任务：点击数字弹任务列表 -->
                <el-popover
                  v-if="s.pendingTaskItems?.length"
                  ref="popPending"
                  placement="top-start"
                  :width="280"
                  trigger="click"
                  :show-arrow="false"
                  popper-class="ov-task-pop"
                >
                  <template #reference>
                    <div class="ov-kpi ov-kpi-click">
                      <span class="ov-kpi-num">{{ s.pendingTaskItems.length }}</span>
                      <span class="ov-kpi-label">剩余任务</span>
                    </div>
                  </template>
                  <div class="ov-pop-head">剩余任务（{{ s.pendingTaskItems.length }}）</div>
                  <ul class="ov-pop-list">
                    <li v-for="(t, i) in s.pendingTaskItems" :key="t.id" class="ov-pop-item" @click="jumpFromPop(t.id, popPending)">
                      <span class="ov-pop-idx">{{ i + 1 }}</span>
                      <span class="ov-pop-name">{{ t.name }}</span>
                      <button class="ov-pop-copy" title="复制搜索语句" @click="copyTaskItem(t)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </li>
                  </ul>
                </el-popover>
                <div v-else class="ov-kpi">
                  <span class="ov-kpi-num">{{ s.pendingTaskItems?.length ?? 0 }}</span>
                  <span class="ov-kpi-label">剩余任务</span>
                </div>

                <!-- 延期：红色数字 -->
                <el-popover
                  v-if="s.delayed?.length"
                  ref="popDelayed"
                  placement="top-start"
                  :width="280"
                  trigger="click"
                  :show-arrow="false"
                  popper-class="ov-task-pop"
                >
                  <template #reference>
                    <div class="ov-kpi ov-kpi-click kpi-alert">
                      <span class="ov-kpi-num">{{ s.delayed.length }}</span>
                      <span class="ov-kpi-label">延期任务</span>
                    </div>
                  </template>
                  <div class="ov-pop-head">延期任务（{{ s.delayed.length }}）</div>
                  <ul class="ov-pop-list">
                    <li v-for="(t, i) in s.delayed" :key="t.id" class="ov-pop-item" @click="jumpFromPop(t.id, popDelayed)">
                      <span class="ov-pop-idx">{{ i + 1 }}</span>
                      <span class="ov-pop-name">{{ t.name }}</span>
                      <button class="ov-pop-copy" title="复制搜索语句" @click="copyTaskItem(t)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </li>
                  </ul>
                </el-popover>
                <div v-else class="ov-kpi kpi-alert">
                  <span class="ov-kpi-num">{{ s.delayed?.length ?? 0 }}</span>
                  <span class="ov-kpi-label">延期任务</span>
                </div>

                <!-- 待确认：琥珀色（关联任务去重显示） -->
                <el-popover
                  v-if="pendingAnnotationTasks.length"
                  ref="popAnnot"
                  placement="top-start"
                  :width="280"
                  trigger="click"
                  :show-arrow="false"
                  popper-class="ov-task-pop"
                >
                  <template #reference>
                    <div class="ov-kpi ov-kpi-click kpi-warn">
                      <span class="ov-kpi-num">{{ s.pendingAnnotations?.length ?? 0 }}</span>
                      <span class="ov-kpi-label">待确认批注</span>
                    </div>
                  </template>
                  <div class="ov-pop-head">待确认批注（{{ pendingAnnotationTasks.length }} 条）</div>
                  <ul class="ov-pop-list">
                    <li v-for="(t, i) in pendingAnnotationTasks" :key="t.annotationId || t.id" class="ov-pop-item" @click="jumpAnnFromPop(t, popAnnot)" :title="t.content || t.name">
                      <span class="ov-pop-idx">{{ i + 1 }}</span>
                      <span class="ov-pop-ann">{{ shortAnn(t.content) }}</span>
                    </li>
                  </ul>
                </el-popover>
                <div v-else class="ov-kpi kpi-warn">
                  <span class="ov-kpi-num">{{ s.pendingAnnotations?.length ?? 0 }}</span>
                  <span class="ov-kpi-label">待确认批注</span>
                </div>

                <!-- 缺日期：点击弹任务列表 -->
                <el-popover
                  v-if="s.noDateTaskItems?.length"
                  ref="popNoDate"
                  placement="top-start"
                  :width="280"
                  trigger="click"
                  :show-arrow="false"
                  popper-class="ov-task-pop"
                >
                  <template #reference>
                    <div class="ov-kpi ov-kpi-click">
                      <span class="ov-kpi-num">{{ s.noDateTaskItems.length }}<span class="ov-kpi-sub">/{{ totalCount }}</span></span>
                      <span class="ov-kpi-label">缺少日期</span>
                    </div>
                  </template>
                  <div class="ov-pop-head">缺少日期任务（{{ s.noDateTaskItems.length }}）</div>
                  <ul class="ov-pop-list">
                    <li v-for="(t, i) in s.noDateTaskItems" :key="t.id" class="ov-pop-item" @click="jumpFromPop(t.id, popNoDate)">
                      <span class="ov-pop-idx">{{ i + 1 }}</span>
                      <span class="ov-pop-name">{{ t.name }}</span>
                      <button class="ov-pop-copy" title="复制搜索语句" @click="copyTaskItem(t)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </li>
                  </ul>
                </el-popover>
                <div v-else class="ov-kpi">
                  <span class="ov-kpi-num">{{ s.noDateTaskItems?.length ?? 0 }}<span class="ov-kpi-sub">/{{ totalCount }}</span></span>
                  <span class="ov-kpi-label">缺少日期</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 列 2：风险 -->
          <div class="ov-col">
            <div class="ov-label ov-label-danger">
              风险
              <button class="ov-gear" title="风险规则配置" @click="riskConfigShow = true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>
            <div v-if="s.risks?.length" class="ov-risks">
              <el-popover
                v-for="(r, i) in s.risks"
                :key="i"
                :ref="(el) => (riskPopRefs[i] = el)"
                :disabled="!r.tasks?.length"
                placement="top-start"
                :width="280"
                trigger="click"
                :show-arrow="false"
                popper-class="ov-task-pop"
              >
                <template #reference>
                  <div class="ov-risk" :class="'risk-' + r.level + (r.tasks?.length ? ' ov-risk-click' : '')">
                    <template v-if="riskParts(r)">
                      <span class="ov-risk-num">{{ riskParts(r).num }}</span>
                      <span class="ov-risk-text">{{ riskParts(r).text }}</span>
                      <span v-if="riskParts(r).note" class="ov-risk-note">{{ riskParts(r).note }}</span>
                    </template>
                    <template v-else>{{ r.desc }}</template>
                  </div>
                </template>
                <div class="ov-pop-head">{{ r.kind === 'risk' ? '风险批注（' + r.tasks.length + '）' : '涉及任务（' + r.tasks.length + '）' }}</div>
                <ul class="ov-pop-list">
                  <li v-for="(t, ti) in r.tasks" :key="t.annotationId || t.id" class="ov-pop-item" @click="jumpAnnFromPop(t, riskPopRefs[i])" :title="t.annotationId ? t.content : t.name">
                    <span class="ov-pop-idx">{{ ti + 1 }}</span>
                    <!-- 批注条目：序号 + 内容截断 + 确认标记；任务条目：序号 + 名称 + 复制 -->
                    <span v-if="t.annotationId" class="ov-pop-ann">{{ shortAnn(t.content) }}</span>
                    <template v-else>
                      <span class="ov-pop-name">{{ t.name }}</span>
                      <button class="ov-pop-copy" title="复制搜索语句" @click="copyTaskItem(t)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </template>
                    <span v-if="t.annotationId" class="ov-pop-conf" :class="t.confirmed ? 'conf-yes' : 'conf-no'">{{ t.confirmed ? '已确认' : '待确认' }}</span>
                  </li>
                </ul>
              </el-popover>
            </div>
            <!-- 缺省：无风险 -->
            <div v-else class="ov-empty-state">
              <img class="ov-empty-img" :src="confettiIcon" alt="" />
              <p>恭喜您！没有风险。</p>
            </div>
          </div>

          <!-- 风险规则配置弹窗 -->
          <RiskConfigModal v-model:show="riskConfigShow" :project-id="projectId" @saved="refresh" />

          <!-- 列 3：下一步 -->
          <div class="ov-col">
            <div class="ov-label">下一步</div>
            <ul v-if="s.nextSteps?.length" class="ov-steps">
              <li v-for="(st, i) in s.nextSteps" :key="i" class="ov-step">
                <span class="ov-step-idx">{{ i + 1 }}</span>
                <span class="ov-step-text">{{ st }}</span>
              </li>
            </ul>
            <!-- 缺省：全部完成 / 已归档 -->
            <div v-else class="ov-empty-state">
              <img class="ov-empty-img" :src="confettiIcon" alt="" />
              <p>{{ s.project?.archived ? '撒花！项目完结！' : '完结撒花！' }}</p>
            </div>
          </div>

          <!-- 列 4：历史总结时间线（V2.0 S14）：懒加载，不随概览刷新 -->
          <div class="ov-col ov-col-tl">
            <div v-if="tlLoading" class="ov-empty">加载中…</div>
            <el-empty v-else-if="!summaries.length" description="暂无数据" :image-size="80" />
            <div v-else class="ov-tl-scroll">
              <ul class="ov-tl-list">
                <li v-for="(it, i) in shownSummaries" :key="it.id || i" class="ov-tl-item">
                  <div class="ov-tl-meta">
                    <span class="ov-tl-time">{{ fmtTime(it.createdAt) }}</span>
                    <span class="ov-tl-src" :class="it.source === 'auto' ? 'src-auto' : 'src-manual'">{{ it.source === 'auto' ? '自动' : '手动' }}</span>
                  </div>
                  <p class="ov-tl-text">{{ summaryText(it.content) }}</p>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 历史总结全部内容：右侧 Drawer（V2.0 精修） -->
    <el-drawer v-model="drawerOpen" title="历史总结" size="420px" :append-to-body="true">
      <!-- 来源筛选：全部 / 自动 / 手动 -->
      <div class="ov-drawer-filter">
        <button
          v-for="opt in SOURCE_FILTERS"
          :key="opt.value"
          class="ov-filter-chip"
          :class="{ active: tlFilter === opt.value }"
          @click="tlFilter = opt.value"
        >{{ opt.label }}</button>
      </div>
      <div v-if="tlLoading" class="ov-empty">加载中…</div>
      <div v-else-if="!filteredSummaries.length" class="ov-empty">暂无该类型总结</div>
      <ul v-else class="ov-tl-list ov-tl-list-drawer">
        <li v-for="(it, i) in filteredSummaries" :key="it.id || i" class="ov-tl-item">
          <div class="ov-tl-meta">
            <span class="ov-tl-time">{{ fmtTime(it.createdAt) }}</span>
            <span class="ov-tl-src" :class="it.source === 'auto' ? 'src-auto' : 'src-manual'">{{ it.source === 'auto' ? '自动' : '手动' }}</span>
          </div>
          <p class="ov-tl-text">{{ summaryText(it.content) }}</p>
        </li>
      </ul>
    </el-drawer>

    <!-- 生成周报（V2.2 R3 + 改造）：公共可拖拽缩放面板，自动生成，md 渲染预览 -->
    <FloatPanel v-model="reportShow" title="生成周报" :default-width="760" :default-height="560">
      <div class="report-panel">
        <div class="report-range">
          <el-radio-group v-model="reportRange" @change="onReportRangeChange">
            <el-radio-button value="thisWeek">本周</el-radio-button>
            <el-radio-button value="lastWeek">上周</el-radio-button>
            <el-radio-button value="last7days">近 7 天</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
          </el-radio-group>
          <el-date-picker
            v-if="reportRange === 'custom'"
            v-model="reportCustomRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            class="report-custom-range"
          />
        </div>

        <div v-if="reportLoading" class="report-loading">正在生成…</div>
        <div v-else-if="reportMarkdown" class="report-preview" v-html="reportHtml"></div>
        <div v-else class="report-loading">暂无周报内容</div>

        <div class="report-foot">
          <el-button size="small" @click="reportShow = false">关闭</el-button>
        </div>
      </div>
    </FloatPanel>
  </section>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api, resolveAssetUrl } from "../../../api.js";
import { toast } from "../../../toast.js";
import RiskConfigModal from "./RiskConfigModal.vue";
import FloatPanel from "../../../components/FloatPanel.vue";

// V2.2：周报 Markdown 轻量渲染（内置，零依赖——避免第三方 md 库在构建产物中的 interop 风险）
// 覆盖周报固定格式：标题 / 列表 / 表格 / 粗体 / 行内代码；未知内容转义后按文本输出
function renderSimpleMd(src) {
  if (!src) return "";
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = String(src).split(/\r?\n/);
  const out = [];
  let i = 0;
  const isTableRow = (l) => /^\|.*\|$/.test(l.trim());
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (/^#{1,6}\s/.test(t)) {
      const lv = t.match(/^#{1,6}/)[0].length;
      out.push(`<h${Math.min(lv, 3)}>${inline(t.replace(/^#{1,6}\s*/, ""))}</h${Math.min(lv, 3)}>`);
      i++; continue;
    }
    if (/^[-*]\s/.test(t)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s*/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^\d+\.\s*/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (isTableRow(t) && isTableRow(lines[i + 1] || "") && /^\|?\s*:?-{2,}\s*\|/.test((lines[i + 1] || "").trim())) {
      // 表头 + 分隔行 + 数据行
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
        rows.push(cells);
        i++;
      }
      const head = rows[0];
      const body = rows.slice(2);
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      continue;
    }
    out.push(`<p>${inline(t)}</p>`);
    i++;
  }
  return out.join("\n");
}

const props = defineProps({ projectId: { type: String, default: "" } });
const emit = defineEmits(["jump-task", "jump-annotation"]);

// KPI / 风险 popover 任务跳转：关闭浮层后通知父级定位 + 高亮
const popPending = ref(null);
const popDelayed = ref(null);
const popAnnot = ref(null);
const popNoDate = ref(null);
const riskPopRefs = ref([]);
function jumpFromPop(taskId, popRef) {
  popRef?.hide();
  emit("jump-task", taskId);
}
// 批注跳转：关闭浮层后通知父级定位批注（任务定位 + 批注高亮闪烁）
function jumpAnnFromPop(item, popRef) {
  popRef?.hide();
  if (item?.annotationId) emit("jump-annotation", { taskId: item.id, annotationId: item.annotationId });
  else if (item?.id) emit("jump-task", item.id);
}

// 撒花缺省图标：经 resolveAssetUrl 解析（自动带插件前缀 + session 凭据）
const confettiIcon = resolveAssetUrl("/api/plugins/neo-project-manage/icons/confetti.png");

const expanded = ref(true); // 默认展开
const loading = ref(false);
const s = ref(null); // summary data
const riskConfigShow = ref(false); // 风险规则配置弹窗

// ===== 生成周报（V2.2 R3 + 改造）：自动生成（打开/切换范围即拉取），md 渲染预览 =====
const reportShow = ref(false);
const reportRange = ref("thisWeek");
const reportCustomRange = ref([]);
const reportLoading = ref(false);
const reportMarkdown = ref("");
const reportHtml = computed(() => renderSimpleMd(reportMarkdown.value));

function openReport() {
  reportMarkdown.value = "";
  reportShow.value = true;
  generateReport();
}
function onReportRangeChange() {
  reportMarkdown.value = "";
  if (reportRange.value !== "custom") generateReport();
}
// 自定义范围选完起止日期后自动生成
watch(reportCustomRange, (v) => {
  if (reportRange.value === "custom" && Array.isArray(v) && v.length >= 2 && v[0] && v[1]) {
    reportMarkdown.value = "";
    generateReport();
  }
});

async function generateReport() {
  if (!props.projectId) return;
  const body = { range: reportRange.value };
  if (reportRange.value === "custom") {
    if (!reportCustomRange.value?.length || reportCustomRange.value.length < 2) {
      toast("请选择自定义起止日期", "error");
      return;
    }
    body.startDate = reportCustomRange.value[0];
    body.endDate = reportCustomRange.value[1];
  }
  reportLoading.value = true;
  try {
    const res = await api(`api/projects/${props.projectId}/report`, {
      method: "POST", body: JSON.stringify(body), silent: true,
    });
    if (res?.ok) {
      reportMarkdown.value = res.data?.markdown || "";
    } else {
      toast(res?.error || "生成失败", "error");
    }
  } finally {
    reportLoading.value = false;
  }
}

// ===== 历史总结时间线（V2.0 S14）=====
const TL_LIMIT = 10; // 默认展示前 10 条，超出部分列表滚动条；更多内容点「更多 >」进 Drawer 查看
const SOURCE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "auto", label: "自动" },
  { value: "manual", label: "手动" },
]; // Drawer 内来源筛选
const tlLoading = ref(false);
const tlLoaded = ref(false); // 已加载过则缓存，不再重复请求
const summaries = ref([]);
const drawerOpen = ref(false); // 历史总结 Drawer 开关
const tlFilter = ref("all"); // 当前筛选：all / auto / manual
// 展示列表：默认前 10 条（超过 350px 高度列表滚动，全部内容在 Drawer 中）
const shownSummaries = computed(() => summaries.value.slice(0, TL_LIMIT));
// Drawer 内按来源筛选后的列表
const filteredSummaries = computed(() => {
  if (tlFilter.value === "all") return summaries.value;
  return summaries.value.filter((it) => it.source === tlFilter.value);
});

let inflight = null; // 防并发：请求进行中再次调用复用同一 promise

async function refresh() {
  if (!props.projectId) return;
  if (inflight) return inflight;
  loading.value = true;
  const p = (inflight = api(`api/projects/${props.projectId}/summary`, { silent: true }).finally(() => { inflight = null; }));
  const res = await p;
  loading.value = false;
  // 接口异常时优雅降级：置 null，面板显示「暂无数据」，不抛错
  s.value = res?.ok ? (res.data || null) : null;
  // P1-2：刷新总结后联动失效时间线缓存并重拉，否则新总结永远不可见
  if (res?.ok) {
    tlLoaded.value = false;
    tlLoading.value = false;
    loadSummaries();
  }
}

/** 懒加载历史总结（只拉一次，重复渲染不重复请求） */
async function loadSummaries() {
  if (!props.projectId || tlLoaded.value || tlLoading.value) return;
  tlLoading.value = true;
  const res = await api(`api/projects/${props.projectId}/summaries`, { silent: true });
  tlLoading.value = false;
  tlLoaded.value = true;
  // 接口异常降级为空列表，显示「暂无历史总结」
  summaries.value = res?.ok && Array.isArray(res.data) ? res.data : [];
}

/** ISO 时间 → 本地可读格式 YYYY-MM-DD HH:mm（不用 toISOString，避免 UTC 偏移） */
function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** content 为总结 JSON 字符串：解析后取 summary，兜底 project.name/progress；解析失败显示原文截断 */
function summaryText(raw) {
  if (!raw) return "-";
  try {
    const obj = JSON.parse(raw);
    const s = obj?.summary;
    if (typeof s === "string" && s.trim()) return s.trim();
    const p = obj?.project;
    if (p && (p.name || p.progress != null)) {
      return `${p.name || "项目"}：完成度 ${p.progress ?? 0}%`;
    }
    return "（总结内容为空）";
  } catch {
    // 解析失败：压缩空白后截断展示原文
    const text = raw.replace(/\s+/g, " ").trim();
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  }
}

// projectId 变化：刷新概览 + 重置时间线缓存（避免串项目数据）
watch(
  () => props.projectId,
  () => {
    tlLoaded.value = false;
    tlLoading.value = false;
    summaries.value = [];
    drawerOpen.value = false;
    refresh();
  },
  { immediate: true }
);
defineExpose({ refresh });

const isEmpty = computed(() => {
  if (!s.value) return false;
  const st = s.value.stats;
  return !(st ? st.total : s.value.completed?.length + s.value.pending?.length);
});

// KPI：任务总数（分母用 stats.total 全量，pending/completed 是截断展示版）
const totalCount = computed(() => s.value?.stats?.total ?? 0);

// 待确认批注：逐条列出（含批注 id/内容/类型），点击定位到具体批注并高亮
const pendingAnnotationTasks = computed(() => {
  const out = [];
  for (const a of s.value?.pendingAnnotations || []) {
    out.push({ id: a.taskId, name: a.name, annotationId: a.annotationId, content: a.content, kind: a.kind });
  }
  return out;
});

// ===== 任务复制（复用 TaskCard 的复制文案与 execCommand 方式）=====
function copyText(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) toast("已复制");
    else toast("复制失败", "error");
  } catch (err) {
    toast("复制失败", "error");
  }
}
function copyTaskItem(t) {
  if (!t?.id) return;
  copyText(`使用项目管理插件工具搜索：【任务 id:${t.id}】 【${t.name || ""}】 的具体内容。`);
}

// 批注内容短展示：去 HTML + 限 10 字（对齐用户规范「前 10 个字...」）
function shortAnn(text) {
  const t = String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 10 ? `${t.slice(0, 10)}...` : t || "（无内容）";
}

// 风险描述解析：把「2 个任务已延期（最长延期 5 天）」拆成 { num, text, note }
// 支持 num 形如「6/10」；无数字时返回 null（模板回退显示原文）
function riskParts(r) {  const desc = String(r?.desc || "");
  const m = /^(\d+\/?\d*)\s*([^（）]*)\s*（?([^（）]*)）?$/.exec(desc);
  if (!m || !m[1]) return null;
  return { num: m[1], text: m[2]?.trim() || "", note: m[3]?.trim() || "" };
}

// 已取消状态色由 token 直接控制（KPI 胶带已固定白色，不再随状态派生）
</script>

<style scoped>
.overview-card {
  flex-shrink: 0;
  margin: 0 24px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 2px 16px 14px;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  transition: min-height 0.2s var(--ease-out);
}
/* 收起态：内容隐藏后卡片同步收缩 */
.ov-collapsed {
  min-height: 0;
  margin-bottom: 8px;
}

/* ===== 头部（与内容区 4 列对齐） =====
 * 项目概览占前 3 列（含刷新按钮），历史总结占第 4 列 */
.ov-cols-head {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  align-items: center;
  padding: 10px 0;
}
.ov-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ov-head-main {
  grid-column: span 3;
  cursor: pointer;
  user-select: none;
}
.ov-head-tl {
  grid-column: 4;
}
.ov-chevron {
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: transform var(--duration-fast) var(--ease-out);
}
.ov-chevron.rotated { transform: rotate(180deg); }
.ov-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.02em;
}
.ov-spacer { flex: 1; }
.ov-refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}
.ov-refresh:hover {
  color: var(--text);
  background: none;
}
.ov-refresh.spinning svg { animation: ov-spin 0.8s linear infinite; }
@keyframes ov-spin { to { transform: rotate(360deg); } }

/* ===== 内容（4 列自适应网格） =====
 * KPI / 风险 / 下一步 / 历史总结 四等分；
 * minmax(200px, 1fr)：容器缩窄时自动换行，不挤压堆叠
 * 历史总结列：内容绝对定位，不参与行高计算；列高由其余列决定，滚动区填满列 */
.ov-body {
  padding: 16px 0 14px;
  flex: 1;
  min-height: 0;
  overflow: visible;
}
.ov-cols-4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  align-items: stretch;
}
.ov-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* 历史总结列：position relative + 内容绝对定位填满（不撑高网格行） */
.ov-col-tl {
  position: relative;
  overflow: hidden;
}
.ov-col-tl .ov-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
/* 历史总结列 el-empty：居中占满列 */
.ov-col-tl :deep(.el-empty) {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ov-col-empty {
  grid-column: 1 / -1;
}
.ov-empty {
  padding: 18px 0;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12.5px;
}
/* 缺省态（撒花图标 + 文案） */
.ov-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 8px;
  text-align: center;
  flex: 1;
  min-height: 120px;
}
.ov-empty-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  opacity: 0.85;
}
.ov-empty-state p {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}
.ov-empty-text {
  padding: 14px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

/* ===== KPI 四宫格（黄底便利贴 + 十字分割线） =====
 * 风格对齐项目卡片：黄底 / 无圆角 / 硬阴影 / 顶部锯齿胶带（白色固定）
 * 四格用十字分割线（中缝横竖两条）分隔，黄底黑字 */
.ov-kpi-frame {
  position: relative;
  align-self: stretch;
  flex: 1;
  background: oklch(0.95 0.1 90 / 0.45);
  border: none;
  border-radius: 0;
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.08);
  padding: 20px;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}
/* 便利贴胶带：锯齿撕口（对齐 ProjectCard.tape），白色固定 + 内侧细边框 */
.ov-kpi-tape {
  position: absolute;
  top: -9px;
  left: 50%;
  width: 72px;
  height: 22px;
  transform: translateX(-50%) rotate(-3deg);
  background: var(--bg-card);
  clip-path: polygon(
    0 6, 3 0, 6 6, 9 0, 12 6, 15 0, 18 6,
    18 0, 54 0,
    54 6, 57 0, 60 6, 63 0, 66 6, 69 0, 72 6,
    72 16, 69 22, 66 16, 63 22, 60 16, 57 22, 54 16,
    54 22, 18 22,
    18 16, 15 22, 12 16, 9 22, 6 16, 3 22, 0 16
  );
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 0 0 1px #00000014;
}
.ov-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 150px;
  flex: 1;
}
.ov-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
  background: transparent;
  text-align: center;
  cursor: default;
}
/* 可点击 KPI（有任务列表）：仅光标提示，悬停不高亮（保持便利贴底色干净） */
.ov-kpi-click {
  cursor: pointer;
}
/* 十字分割线：中缝竖线 + 第一行横线（2px 虚线） */
.ov-kpi:nth-child(odd) {
  border-right: 2px dashed var(--border);
}
.ov-kpi:nth-child(-n + 2) {
  border-bottom: 2px dashed var(--border);
}
.ov-kpi-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: 0.14em;
  line-height: 1;
}
.ov-kpi-num {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.ov-kpi-sub {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-left: 1px;
}
/* 状态色只染数字：延期红 / 待确认琥珀 */
.ov-kpi.kpi-alert .ov-kpi-num { color: var(--danger); }
.ov-kpi.kpi-warn .ov-kpi-num { color: var(--accent-warm); }
/* 可点击 KPI（有任务列表）：默认实色，hover 时数字淡化提示可交互（区别于背景色块高亮） */
.ov-kpi-click:hover .ov-kpi-num {
  color: color-mix(in oklch, var(--text) 55%, transparent);
}
.ov-kpi-click.kpi-alert:hover .ov-kpi-num {
  color: color-mix(in oklch, var(--danger) 55%, transparent);
}
.ov-kpi-click.kpi-warn:hover .ov-kpi-num {
  color: color-mix(in oklch, var(--accent-warm) 55%, transparent);
}
.ov-kpi-click:hover .ov-kpi-sub {
  color: color-mix(in oklch, var(--text-tertiary) 60%, transparent);
}

.ov-label {
  display: inline-flex;
  align-items: center;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.18em;
  padding-left: 8px;
  border-left: 2px solid var(--text);
  margin-bottom: 6px;
}
/* 风险标题：朱砂红（系统 danger 色）左边线 */
.ov-label-danger {
  color: var(--danger);
  border-left-color: var(--danger);
}
/* 风险标题旁齿轮（规则配置入口） */
.ov-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.ov-gear:hover {
  color: var(--text);
  background: var(--bg-hover);
}

/* 风险：数字强调 + 描述 + 灰色注 */
.ov-risks {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ov-risk {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  font-size: 15px;
  color: var(--text);
  line-height: 1.6;
  cursor: default;
}
/* 可点击风险（有涉及任务）→ 悬停反馈 */
.ov-risk-click {
  cursor: pointer;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.ov-risk-click:hover {
  opacity: 0.72;
}
.ov-risk-num {
  font-size: 19px;
  font-weight: 700;
  color: var(--danger);
  margin-right: 5px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.ov-risk-text {
  color: var(--text);
}
.ov-risk-note {
  color: var(--text-tertiary);
  font-size: 13px;
  margin-left: 2px;
}

/* 下一步：数字序号方框 + 文字 */
.ov-steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.ov-step {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 15px;
  color: var(--text);
  line-height: 1.6;
}
.ov-step-idx {
  display: inline-flex;
  width: 20px;
  height: 20px;
  background: var(--text);
  color: var(--bg-card);
  font-size: 13px;
  font-weight: 700;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.ov-step-text {
  flex: 1;
  min-width: 0;
}
.ov-steps-empty li {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

/* ===== 历史总结时间线（V2.0 S14）===== */
.ov-tl-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.02em;
}
.ov-tl-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 0 7px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.ov-tl-spacer { flex: 1; }
.ov-tl-more {
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-out);
}
.ov-tl-more:hover {
  color: var(--text);
}
.ov-tl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* 滚动容器：绝对定位填满历史总结列，内容超高时自己滚动 */
.ov-tl-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.ov-tl-scroll::-webkit-scrollbar { width: 5px; }
.ov-tl-scroll::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
.ov-tl-scroll::-webkit-scrollbar-track { background: transparent; }
/* Drawer 内列表：撑满高度滚动，间距更宽松 */
.ov-tl-list-drawer {
  gap: 16px;
}
.ov-tl-list-drawer .ov-tl-text {
  font-size: 12.5px;
}
/* Drawer 内来源筛选 chips */
.ov-drawer-filter {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.ov-filter-chip {
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  font-family: inherit;
  padding: 3px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.ov-filter-chip:hover {
  border-color: var(--border);
  color: var(--text);
}
.ov-filter-chip.active {
  color: var(--accent-warm);
  border-color: var(--accent-warm);
  background: var(--accent-warm-subtle);
}
.ov-tl-item {
  position: relative;
  padding-left: 16px;
}
/* 竖线（最后一条不延伸） */
.ov-tl-item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: -12px;
  width: 1px;
  background: var(--border-light);
}
/* 圆点 */
.ov-tl-item::after {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border);
  box-shadow: 0 0 0 2px var(--bg-card);
}
.ov-tl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.ov-tl-time {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.ov-tl-src {
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.ov-tl-src.src-auto {
  color: var(--status-doing-text);
  background: oklch(0.62 0.21 255 / 0.12);
}
.ov-tl-src.src-manual {
  color: var(--accent-warm);
  background: var(--accent-warm-subtle);
}
.ov-tl-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  word-break: break-word;
}

/* ===== 生成周报（V2.2 R3 + 改造） ===== */
.report-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px 16px;
}
.report-range {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.report-custom-range {
  width: 260px;
}
.report-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.report-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 14px 16px;
  background: var(--bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text);
  word-break: break-word;
}
/* md 渲染：标题/列表/引用/粗体等基础样式 */
.report-preview :deep(h1),
.report-preview :deep(h2),
.report-preview :deep(h3) {
  margin: 14px 0 8px;
  font-weight: 600;
  color: var(--text);
  border-bottom: 0.5px solid var(--border-light);
  padding-bottom: 4px;
}
.report-preview :deep(h1) { font-size: 17px; }
.report-preview :deep(h2) { font-size: 15.5px; }
.report-preview :deep(h3) { font-size: 14px; }
.report-preview :deep(p) { margin: 6px 0; }
.report-preview :deep(ul),
.report-preview :deep(ol) { margin: 6px 0; padding-left: 22px; }
.report-preview :deep(li) { margin: 3px 0; }
.report-preview :deep(blockquote) {
  margin: 8px 0;
  padding: 2px 12px;
  border-left: 3px solid var(--accent-warm, #b8860b);
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.report-preview :deep(code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12.5px;
  background: var(--bg-hover);
  padding: 1px 5px;
  border-radius: 4px;
}
.report-preview :deep(table) { border-collapse: collapse; margin: 8px 0; }
.report-preview :deep(th),
.report-preview :deep(td) {
  border: 1px solid var(--border-light);
  padding: 5px 10px;
  font-size: 13px;
}
.report-preview :deep(th) { background: var(--bg-hover); font-weight: 600; }
.report-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  flex-shrink: 0;
}
</style>

<style>
/* ===== Drawer 微调（V2.0 精修） =====
 * el-drawer 内容 teleport 到 body，scoped/:deep 无法命中，必须用全局样式 */
.el-drawer__header {
  margin-bottom: 0;
  padding: 20px 20px 0;
}
.el-drawer__header .el-drawer__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

/* ===== 概览面板任务 Popover（teleport 到 body，必须全局） =====
 * 黑白极简：白底 / 无箭头 / 硬边框 / 列表行悬停 */
.ov-task-pop.el-popover {
  --el-popover-padding: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  background: var(--bg-card);
  max-height: 320px;
  overflow-y: auto;
}
.ov-pop-head {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.04em;
  padding: 2px 2px 8px;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 6px;
}
.ov-pop-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ov-pop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.ov-pop-item:hover {
  background: var(--bg-hover);
}
.ov-pop-idx {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--text);
  color: var(--bg-card);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  border-radius: 3px;
}
.ov-pop-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
/* 批注条目（待确认/风险批注）：序号 + 内容单行截断 */
.ov-pop-ann {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 风险批注确认状态小标（聚合条目明细行） */
.ov-pop-conf {
  flex-shrink: 0;
  font-size: 10.5px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 3px;
  margin-left: 6px;
  font-weight: 600;
}
.ov-pop-conf.conf-yes {
  color: var(--accent);
  background: var(--accent-subtle);
}
.ov-pop-conf.conf-no {
  color: var(--accent-warm-hover);
  background: var(--accent-warm-subtle);
}
.ov-pop-copy {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.ov-pop-copy:hover {
  color: var(--text);
  background: var(--bg-hover);
}
</style>
