import fs from "node:fs";
import path from "node:path";

const HANA_BUS_SKIP = Symbol.for("hana.event-bus.skip");

export default class Plugin {
  async onload() {
    const ctx = this.ctx;

    // Ensure data directory exists
    const dataDir = ctx.dataDir;
    if (dataDir) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (ctx.bus.handle) {
      this.register(ctx.bus.handle("hana-plugin:status", (payload) => {
        if (payload?.pluginId && payload.pluginId !== ctx.pluginId) return HANA_BUS_SKIP;
        return {
          ok: true,
          pluginId: ctx.pluginId,
          name: "项目管理",
        };
      }));
    }
    ctx.log.info("项目管理 loaded");
  }

  async onunload() {
    this.ctx.log.info("项目管理 unloaded");
  }
}
