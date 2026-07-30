// 2026-07-30 暂时隐藏禅道 tab，对应工具文件整体注释。需要时取消注释即可恢复。
/*
import fs from "node:fs";
import path from "node:path";

export const name = "list_zentao_bugs";
export const description = "从禅道获取我的 Bug 并按【XX】前缀分组（需要先通过 initZentao 登录）";
export const parameters = {
  type: "object",
  properties: {
    productId: { type: "integer", description: "可选，仅获取指定产品的 Bug" },
  },
};

export async function execute(input, toolCtx) {
  // 通知用户数据已由前端接入，实时刷新需 Agent 协助
  return {
    content: [{
      type: "text",
      text: [
        "禅道 Bug 数据已接入项目管理插件。",
        "",
        "数据查看方式：",
        "1. 打开项目管理 → 禅道 Tab，自动展示缓存的 Bug 列表",
        "2. 需要拉取最新数据时，对我说：**刷新禅道Bug**",
        "",
        "当前数据路径：zentao-bugs.json",
      ].join("\n"),
    }],
  };
}
*/
