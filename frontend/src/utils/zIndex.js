// 全局弹窗层级管理：避免多个弹窗/浮动面板互相覆盖
// 惰性初始化：首次调用时扫描 DOM 现有最高 z-index 作为基准，之后每次调用 +1
// 用法：打开任何浮层（弹窗、浮动面板、确认框）时调用 nextZIndex() 取层级，后打开的永远更高

let topZ = 0;
let scanned = false;

export function nextZIndex() {
  if (!scanned) {
    scanned = true;
    for (const el of document.querySelectorAll("*")) {
      const z = parseInt(window.getComputedStyle(el).zIndex, 10);
      if (!Number.isNaN(z) && z > topZ) topZ = z;
    }
  }
  topZ += 1;
  return topZ;
}
