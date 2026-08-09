/**
 * 共享糖果色调色板（10 色，冷暖相间，鲜艳 + 半透明）
 * 饱和度对齐状态色（C 0.19-0.22），透明度 75% 透出日历底色，用于日历事件条、项目集色块等场景
 */
export const candyPalette = [
  "oklch(0.64 0.20 235 / 0.75)",  // 1. 蓝   (冷)
  "oklch(0.68 0.22 350 / 0.75)",  // 2. 粉   (暖)
  "oklch(0.66 0.20 195 / 0.75)",  // 3. 青   (冷)
  "oklch(0.68 0.21 55 / 0.75)",   // 4. 橙   (暖)
  "oklch(0.64 0.20 295 / 0.75)",  // 5. 紫   (冷)
  "oklch(0.74 0.20 90 / 0.75)",   // 6. 黄   (暖)
  "oklch(0.63 0.20 265 / 0.75)",  // 7. 蓝紫 (冷)
  "oklch(0.66 0.21 325 / 0.75)",  // 8. 玫红 (暖)
  "oklch(0.66 0.19 155 / 0.75)",  // 9. 草绿 (冷)
  "oklch(0.63 0.20 25 / 0.75)",   // 10. 棕红 (暖)
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