import { createDataAccess } from "../lib/data.js";

export const name = "update_message_config";
export const description = "更新消息提醒配置（V2.3）：deadlineDays 到期提醒提前天数（1-14 整数）、deadlineEnabled 到期提醒开关、riskEnabled 风险提醒开关；传哪个改哪个，校验后写入，返回更新后的完整配置";
export const parameters = {
  type: "object",
  required: [],
  properties: {
    deadlineDays: { type: "integer", minimum: 1, maximum: 14, description: "到期提醒提前天数（1-14，默认 3）" },
    deadlineEnabled: { type: "boolean", description: "到期提醒开关（false 时不生成新的 deadline 消息，历史消息保留）" },
    riskEnabled: { type: "boolean", description: "风险提醒开关（false 时不生成新的 risk 消息，历史消息保留）" },
  },
};

export async function execute(input, toolCtx) {
  const data = createDataAccess(toolCtx.dataDir);
  const config = data.updateMessageConfig({
    deadlineDays: input.deadlineDays,
    deadlineEnabled: input.deadlineEnabled,
    riskEnabled: input.riskEnabled,
  });
  return { content: [{ type: "text", text: JSON.stringify({ config }, null, 2) }] };
}
