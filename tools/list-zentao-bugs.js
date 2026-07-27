import { createDataAccess } from "../lib/data.js";

export const name = "list_zentao_bugs";
export const description = "从禅道获取我的 Bug 并按【XX】前缀分组（需要先通过 initZentao 登录）";
export const parameters = {
  type: "object",
  properties: {
    productId: { type: "integer", description: "可选，仅获取指定产品的 Bug" },
  },
};

export async function execute(input, toolCtx) {
  return {
    content: [{
      type: "text",
      text: "请通过会话直接使用「mcp_zentao-bug_getMyBugs」工具获取禅道 Bug，获取后我可以帮您按【XX】前缀分组整理。"
    }],
  };
}
