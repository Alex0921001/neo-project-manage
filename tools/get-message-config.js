import { createDataAccess } from "../lib/data.js";

export const name = "get_message_config";
export const description = "获取消息提醒配置（V2.3）：到期提醒提前天数 deadlineDays（1-14，默认 3）、到期提醒开关 deadlineEnabled、风险提醒开关 riskEnabled";
export const parameters = {
  type: "object",
  required: [],
  properties: {},
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const config = data.getMessageConfig();
  return { content: [{ type: "text", text: JSON.stringify({ config }, null, 2) }] };
}
