/**
 * 共享糖果色调色板（10 色，冷暖相间）
 * 用于日历事件条、项目集色块等需要按位置区分颜色的场景
 */
export const candyPalette = [
  "oklch(0.78 0.10 220)",  // 1. 蓝   (冷)
  "oklch(0.82 0.10 350)",  // 2. 粉   (暖)
  "oklch(0.80 0.10 190)",  // 3. 青   (冷)
  "oklch(0.82 0.12 50)",   // 4. 橙   (暖)
  "oklch(0.78 0.10 290)",  // 5. 紫   (冷)
  "oklch(0.85 0.13 95)",   // 6. 黄   (暖)
  "oklch(0.78 0.10 260)",  // 7. 蓝紫 (冷)
  "oklch(0.80 0.10 320)",  // 8. 玫红 (暖)
  "oklch(0.80 0.08 160)",  // 9. 草绿 (冷)
  "oklch(0.78 0.10 25)",   // 10. 棕红 (暖)
];

/**
 * 按数字索引取色（顺序填充），缺省按字符串哈希
 */
export function pickPaletteColor(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return candyPalette[((seed % candyPalette.length) + candyPalette.length) % candyPalette.length];
  }
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return candyPalette[h % candyPalette.length];
}