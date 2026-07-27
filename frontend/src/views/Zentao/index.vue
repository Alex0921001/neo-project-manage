<template>
  <div class="zentao-view">
    <div class="section-header">
      <h2>🐞 禅道 Bug 看板</h2>
    </div>
    <div class="empty-state" style="padding:60px 20px">
      <p>禅道 Bug 数据通过对话获取</p>
      <p style="margin-top:8px;font-size:12px;color:var(--text-secondary,#888)">
        对我说：<em>"帮我看下禅道上的 Bug"</em>
      </p>
      <p style="margin-top:4px;font-size:12px;color:var(--text-secondary,#888)">
        我会从禅道拉取数据并按【XX】分组展示
      </p>
    </div>
  </div>
</template>

<style scoped>
.zentao-view { padding: 20px; overflow-y: auto; flex: 1; }
</style>
