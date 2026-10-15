import fs from "node:fs";
import { isDenied } from "./safe-fs.js";

/**
 * 文件读取的统一入口：v2 走宿主 ResourceIO，v1 回落到裸 fs。
 *
 * 背景：v2 App 子进程的文件系统被 Permission Model 收进白名单，
 * 安装目录只读 + app-data 可写，**读不到工作区路径的裸 fs 会直接抛
 * ERR_ACCESS_DENIED**。宿主的 `ctx.resources`（ref = local-file）是唯一
 * 合法读盘外文件通道，盘外读需要能力词 `app/resources.read`。
 *
 * 用法：
 *   const hostFs = createHostFs(toolCtx.resources);
 *   const r = await hostFs.readBuffer(path);
 *   if (!r.ok) throw new Error(r.error);
 *   use(r.bytes);
 */

/** 归一化宿主 read/materialize 的返回值 → Buffer */
function toBuffer(r) {
  if (r == null) return null;
  if (Buffer.isBuffer(r)) return r;
  if (r instanceof Uint8Array) return Buffer.from(r);
  if (typeof r === "string") return Buffer.from(r, "utf8");
  if (typeof r === "object") {
    // 形态可能是 { bytes } / { data } / { content } / { buffer } / { text }；
    // 也可能本身是 JSON 化的 Buffer（{ type: "Buffer", data: [...] }）
    if (r.type === "Buffer" && Array.isArray(r.data)) return Buffer.from(r.data);
    for (const k of ["bytes", "data", "content", "buffer", "text"]) {
      const v = r[k];
      if (v == null) continue;
      if (Buffer.isBuffer(v)) return v;
      if (v instanceof Uint8Array) return Buffer.from(v);
      if (typeof v === "string") return Buffer.from(v, "utf8");
      if (v && v.type === "Buffer" && Array.isArray(v.data)) return Buffer.from(v.data);
    }
  }
  return null;
}

/** 从宿主 stat 返回值里取 size（拿不到返回 null） */
function sizeOf(r) {
  if (!r || typeof r !== "object") return null;
  const n = r.size ?? r.bytes ?? r.length;
  return typeof n === "number" ? n : null;
}

export function createHostFs(resources) {
  const viaHost = !!(resources && typeof resources.read === "function");
  const ref = (p) => ({ kind: "local-file", path: p });

  return {
    /** "host"=宿主 ResourceIO（v2）；"fs"=裸 fs（v1） */
    mode: viaHost ? "host" : "fs",

    /** 读文件 → { ok, bytes?, size?, error? } */
    async readBuffer(p) {
      if (viaHost) {
        try {
          const r = await resources.read(ref(p));
          const bytes = toBuffer(r);
          if (bytes) return { ok: true, bytes, size: bytes.length };
          // 个别实现 read 只回元数据：退回 materialize 取字节
          if (typeof resources.materialize === "function") {
            const m = await resources.materialize(ref(p));
            const mb = toBuffer(m);
            if (mb) return { ok: true, bytes: mb, size: mb.length };
          }
          return { ok: false, error: "宿主未返回文件内容" };
        } catch (e) {
          return { ok: false, error: hostErrText(e) };
        }
      }
      try {
        const bytes = fs.readFileSync(p);
        return { ok: true, bytes, size: bytes.length };
      } catch (e) {
        return { ok: false, error: fsErrText(e) };
      }
    },

    /** 读元信息 → 对象（大小等）或 null */
    async stat(p) {
      if (viaHost) {
        try {
          const r = await resources.stat(ref(p));
          return r || null;
        } catch {
          return null;
        }
      }
      try {
        const st = fs.statSync(p);
        return { size: st.size, isFile: st.isFile() };
      } catch {
        return null;
      }
    },

    /** 是否存在（读不到返回 false；判定不确定时调用方自行决定语义） */
    async exists(p) {
      const st = await this.stat(p);
      return !!st;
    },

    /** 返回文件大小（字节）或 null；不读正文时可先探大小 */
    async size(p) {
      const st = await this.stat(p);
      const n = sizeOf(st);
      if (n !== null) return n;
      const r = await this.readBuffer(p);
      return r.ok ? r.size : null;
    },

    ref,
  };
}

function fsErrText(e) {
  return isDenied(e) ? "路径不在应用可读范围内（v2 下需走宿主资源授权）" : e.message;
}

function hostErrText(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/capabilit|permission|denied|授权|not granted/i.test(msg)) {
    return `宿主拒绝读取（未授权 app/resources.read）：${msg}`;
  }
  return msg;
}
