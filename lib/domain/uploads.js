// 图片上传（V2.6.1 拆分自 data.js，机械搬移不改逻辑）
import fs from "fs";
import path from "path";
// 依赖经 ctx 注入；跨域调用运行时解引用，无循环 import
export function createUploadsModule(ctx) {
  // ===== 图片上传（富文本内嵌图，存 plugin-data/uploads/）=====

  const UPLOAD_ALLOWED_EXT = ["png", "jpg", "jpeg", "gif", "webp"];
  const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

  // 文件头魔数校验（防伪装扩展名，P1-2）
  function matchesMagic(buffer, ext) {
    const b = [...buffer.subarray(0, 12)];
    const eq = (arr) => arr.every((v, i) => b[i] === v);
    if (ext === "png") return eq([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (ext === "jpg" || ext === "jpeg") return eq([0xff, 0xd8, 0xff]);
    if (ext === "gif") return eq([0x47, 0x49, 0x46, 0x38]);
    if (ext === "webp") return eq([0x52, 0x49, 0x46, 0x46]) && eq([0x57, 0x45, 0x42, 0x50]);
    return false;
  }

  /**
   * 保存上传的图片（单图 ≤ 2MB，仅 png/jpg/jpeg/gif/webp，魔数校验）
   * @param {Buffer} buffer 文件二进制
   * @param {string} filename 原始文件名（用于取扩展名）
   * @returns {{name: string, url: string}} name=落盘文件名（shortId+ext），url 由路由层补全前缀
   */
  function saveUploadedFile(buffer, filename) {
    const ext = (path.extname(filename || "").slice(1) || "").toLowerCase();
    if (!UPLOAD_ALLOWED_EXT.includes(ext)) {
      throw new Error(`仅支持 ${UPLOAD_ALLOWED_EXT.join(" / ")} 图片`);
    }
    if (!buffer || buffer.length === 0) throw new Error("文件内容为空");
    if (buffer.length > UPLOAD_MAX_BYTES) throw new Error("单图不能超过 2MB");
    if (!matchesMagic(buffer, ext)) throw new Error("文件内容与扩展名不符（魔数校验失败）");
    const dir = path.join(dataDir, "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const name = `${shortId()}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    return { name, url: name };
  }
  return {
    matchesMagic,
    saveUploadedFile,
  };
}
