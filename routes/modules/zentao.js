import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { URL, URLSearchParams } from "node:url";

const ZENTAO_BUGS_FILE = "zentao-bugs.json";
const ZENTAO_CONFIG_FILE = "zentao-config.json";

/**
 * ZenTao 路由模块
 *
 * 直连 ZenTao REST API（使用 Node.js 内置 https/http 模块，兼容 v16）。
 * 每次打开 Tab 自动拉取指派给自己的 Bug。
 */
export function registerZentaoRoutes(app, ctx) {
  const dataDir = ctx.dataDir;
  const bugsPath = path.join(dataDir, ZENTAO_BUGS_FILE);
  const configPath = path.join(dataDir, ZENTAO_CONFIG_FILE);
  let cachedToken = null;

  // ===== 配置 =====

  function readConfig() {
    try {
      const raw = fs.readFileSync(configPath, "utf-8").trim();
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeConfig(data) {
    fs.mkdirSync(dataDir, { recursive: true });
    const config = {
      url: data.url.replace(/\/+$/, ""),
      account: data.account,
      password: data.password,
      configuredAt: new Date().toISOString(),
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    cachedToken = null;
    return config;
  }

  // ===== HTTP 请求工具 =====

  /** 执行 HTTPS/HTTP 请求，返回 { status, body } */
  function request(method, urlStr, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const mod = parsed.protocol === "https:" ? https : http;

      const req = mod.request(
        urlStr,
        {
          method,
          headers: {
            ...headers,
            ...(body != null ? { "Content-Length": Buffer.byteLength(body) } : {}),
          },
          rejectUnauthorized: false, // 跳过 SSL 验证（与 MCP 的 ZENTAO_SKIP_SSL=true 一致）
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve({ status: res.statusCode, body: raw });
          });
        }
      );

      req.on("error", (err) => reject(err));
      req.setTimeout(20000, () => {
        req.destroy();
        reject(new Error("请求超时"));
      });

      if (body != null) req.write(body);
      req.end();
    });
  }

  /** 解析 JSON 响应，非 JSON 返回原始文本 */
  function parseBody(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  // ===== ZenTao API =====

  async function login(config) {
    const loginUrl = `${config.url}/api.php/v1/tokens`;
    const { status, body } = await request("POST", loginUrl, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: config.account, password: config.password }),
    });

    if (status !== 201) {
      throw new Error(`登录失败 (${status}): ${body.slice(0, 100)}`);
    }

    const data = parseBody(body);
    const token = data?.token || "";
    if (!token) throw new Error("登录接口未返回 token");
    cachedToken = token;
    return token;
  }

  async function fetchMyBugs(config) {
    let token = cachedToken;
    if (!token) token = await login(config);

    const query = new URLSearchParams({
      fields: "bug",
      type: "assignedTo",
      order: "id_desc",
      page: "1",
      limit: "200",
    });
    const apiUrl = `${config.url}/api.php/v1/user?${query}`;

    const doFetch = async (tok) => {
      return request("GET", apiUrl, {
        headers: { "Content-Type": "application/json", Token: tok },
      });
    };

    let { status, body } = await doFetch(token);

    // 401 → token 过期，重新登录再试
    if (status === 401) {
      cachedToken = null;
      token = await login(config);
      const retry = await doFetch(token);
      status = retry.status;
      body = retry.body;
    }

    if (status !== 200) {
      throw new Error(`获取 Bug 失败 (${status})`);
    }

    const payload = parseBody(body);
    return normalizeBugs(payload);
  }

  /**
   * My Bugs 响应格式：{ bug: { bugs: [...], total: N } }
   */
  function normalizeBugs(payload) {
    let rawBugs = [];
    if (payload?.bug?.bugs && Array.isArray(payload.bug.bugs)) {
      rawBugs = payload.bug.bugs;
    } else if (Array.isArray(payload.bugs)) {
      rawBugs = payload.bugs;
    } else if (Array.isArray(payload.data)) {
      rawBugs = payload.data;
    }

    const bugs = rawBugs
      .filter((b) => b && (b.id || b.Id))
      .map((b) => ({
        id: b.id || b.Id,
        title: b.title || b.Title || "",
      }));

    bugs.sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-CN"));
    return bugs;
  }

  // ===== 路由 =====

  app.get("/api/zentao/bugs", async (c) => {
    const config = readConfig();
    if (!config) {
      return c.json({
        ok: false,
        error: "未配置禅道连接",
        hint: "请对我说：配置禅道，地址是 xxx，账号 xxx，密码 xxx",
      });
    }

    try {
      const bugs = await fetchMyBugs(config);
      fs.writeFileSync(bugsPath, JSON.stringify(bugs, null, 2), "utf-8");
      return c.json({ ok: true, data: bugs });
    } catch (err) {
      ctx.log.error(`[zentao] fetch failed: ${err.message}`);
      const cached = readBugs();
      if (cached.length > 0) {
        return c.json({
          ok: true,
          data: cached,
          warning: `无法连接禅道，显示缓存数据：${err.message}`,
        });
      }
      return c.json({ ok: false, error: err.message });
    }
  });

  app.post("/api/zentao/configure", async (c) => {
    try {
      const body = await c.req.json();
      const { url, account, password } = body;
      if (!url || !account || !password) {
        return c.json({ ok: false, error: "缺少必填参数：url, account, password" });
      }
      const config = writeConfig({ url, account, password });
      ctx.log.info(`[zentao] configured: ${config.url} / ${config.account}`);
      return c.json({ ok: true, data: { url: config.url, account: config.account } });
    } catch (err) {
      return c.json({ ok: false, error: err.message }, 400);
    }
  });

  function readBugs() {
    try {
      const raw = fs.readFileSync(bugsPath, "utf-8").trim();
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  ctx.log.info("[zentao] routes registered (direct API - node https)");
}
