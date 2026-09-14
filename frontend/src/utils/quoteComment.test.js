import { describe, it, expect, beforeEach } from "vitest";
import { getSelectionAnchor } from "./quoteComment.js";

function setSelection(range) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

describe("getSelectionAnchor 选区锚点", () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.innerHTML = "<p>第一段文字</p><p>第二段文字</p>";
    document.body.appendChild(container);
  });

  it("三击选段（range 边界落在元素节点）能取到锚点", () => {
    const range = document.createRange();
    range.setStart(container, 0);
    range.setEnd(container, 1);
    setSelection(range);
    const a = getSelectionAnchor(container);
    expect(a).not.toBeNull();
    expect(a.start).toBe(0);
    expect(a.text).toBe("第一段文字");
  });

  it("拖动选词（文本节点边界）偏移正确", () => {
    const t = container.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(t, 1);
    range.setEnd(t, 4);
    setSelection(range);
    const a = getSelectionAnchor(container);
    expect(a).not.toBeNull();
    expect(a.start).toBe(1);
    expect(a.text).toBe("一段文");
  });

  it("跨段落选区偏移连续", () => {
    const p1 = container.children[0].firstChild;
    const p2 = container.children[1].firstChild;
    const range = document.createRange();
    range.setStart(p1, 3);
    range.setEnd(p2, 2);
    setSelection(range);
    const a = getSelectionAnchor(container);
    expect(a).not.toBeNull();
    expect(a.start).toBe(3);
    expect(a.text).toBe("文字第二");
  });

  it("折叠选区返回 null", () => {
    const t = container.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(t, 2);
    range.collapse(true);
    setSelection(range);
    expect(getSelectionAnchor(container)).toBeNull();
  });
});
