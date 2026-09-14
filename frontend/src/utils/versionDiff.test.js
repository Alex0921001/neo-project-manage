import { describe, it, expect } from "vitest";
import { renderDiff } from "./versionDiff.js";

const va = {
  content: [
    "<h3>标题</h3>",
    "<p>共同段落</p>",
    "<table><tbody><tr><td>表格A</td></tr><tr><td>表格B</td></tr></tbody></table>",
    "<p>仅旧版有的长段落内容啊</p>",
  ].join(""),
};
const vb = {
  content: [
    "<h3>标题</h3>",
    "<p>共同段落</p>",
    "<table><tbody><tr><td>表格A</td></tr></tbody></table>",
    "<p>仅新版有</p>",
    "<p>另一段新增内容</p>",
  ].join(""),
};

const body = (a, b) => renderDiff(a, b).bodyHtml;

describe("renderDiff 行结构与类名", () => {
  const out = body(va, vb);

  it("行类与行内词块类不冲突：单侧行使用 vd-row-del / vd-row-add", () => {
    expect(out).not.toMatch(/class="vd-row vd-del"/);
    expect(out).not.toMatch(/class="vd-row vd-add"/);
    expect(out).toMatch(/vd-row vd-row-del|vd-row vd-row-add/);
  });

  it("单侧行内容侧用 vd-tint 包裹，颜色由 tint 承担", () => {
    expect(out).toMatch(/vd-del-side"><span class="vd-tint">/);
    expect(out).toMatch(/vd-add-side"><span class="vd-tint">/);
  });

  it("单侧行的空侧为空 cell，不含 tint（不铺色）", () => {
    expect(out).toMatch(/vd-row vd-row-del"[\s\S]*?<div class="vd-cell vd-r"><\/div>/);
    expect(out).toMatch(/vd-row vd-row-add"><div class="vd-cell vd-l"><\/div>/);
  });

  it("表格参与重写时同样走 tint 包裹（底色不铺满格子）", () => {
    const w = body(
      { content: "<p>旧段落内容</p><table><tbody><tr><td>旧表</td></tr></tbody></table>" },
      { content: "<p>新段落内容</p><table><tbody><tr><td>新表</td></tr></tbody></table>" }
    );
    expect(w).not.toMatch(/vd-rewrite-l">\s*<table/);
  });

  it("行内词块仍使用 vd-del / vd-add（小改场景）", () => {
    const m = body(
      { content: "<p>任务截止时间默认为下周一，逾期会自动提醒负责人。</p>" },
      { content: "<p>任务截止时间默认为本周五，逾期会自动提醒负责人。</p>" }
    );
    expect(m).toMatch(/<del class="vd-del">|<ins class="vd-add">/);
  });

  it("编辑行左右各自纯净：左栏不含新版独有文字，右栏不含旧版独有文字", () => {
    const m = body(
      { content: "<p>AAAAA BBBBB</p>" },
      { content: "<p>AAAAA CCCCC</p>" }
    );
    const l = m.match(/<div class="vd-cell vd-l">([\s\S]*?)<\/div>/)[1];
    const r = m.match(/<div class="vd-cell vd-r">([\s\S]*?)<\/div>/)[1];
    expect(l).toContain("BBBBB");
    expect(l).not.toContain("CCCCC");
    expect(r).toContain("CCCCC");
    expect(r).not.toContain("BBBBB");
  });
});
