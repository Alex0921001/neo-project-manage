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

// 共享弹窗栈（模块级单例，所有 FloatPanel 实例共用）：记录各面板当前 z-index，
// Esc 只关最上层（栈顶），点击置顶时同步重排栈序
export const openStack = [];

/**
 * 点击置顶：重新取号并返回新层级（调用方负责同步自身 zIndex 与 openStack 栈序）。
 * 已是当前最顶层（currentZ === topZ）时原值返回，避免反复点击让计数器无谓膨胀。
 */
export function bringToFront(currentZ) {
  if (typeof currentZ === "number" && currentZ === topZ) return currentZ;
  return nextZIndex();
}
