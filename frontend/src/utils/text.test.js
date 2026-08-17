import { describe, it, expect } from "vitest";
import { formatDescription, richTextToPlain } from "./text.js";

describe("formatDescription", () => {
  it("空值返回空串", () => {
    expect(formatDescription("")).toBe("");
    expect(formatDescription(null)).toBe("");
    expect(formatDescription(undefined)).toBe("");
  });

  it("富文本（含块级标签）直接返回原文", () => {
    const html = "<p>最终方案：OAuth2</p>";
    expect(formatDescription(html)).toBe(html);
  });

  it("纯文本转义 + 换行转 br", () => {
    const out = formatDescription("a < b\n第二行");
    expect(out).toContain("&lt;");
    expect(out).toContain("<br>");
    expect(out).not.toContain("\n");
  });
});

describe("richTextToPlain", () => {
  it("剥离标签并解实体", () => {
    expect(richTextToPlain("<p>你好 &amp; 世界</p>")).toBe("你好 & 世界");
  });

  it("空值返回空串", () => {
    expect(richTextToPlain(null)).toBe("");
    expect(richTextToPlain("")).toBe("");
  });
});
