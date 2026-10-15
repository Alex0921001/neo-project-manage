#!/usr/bin/env python3
"""生成 neo-project-manage v2 App 的图标与卡片封面（纯几何，无外部素材）。

用法：py scripts/gen-v2-icons.py
产物：v2/assets/icon.png（512²）、v2/assets/cover.png（1200×630）
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "v2", "assets")
os.makedirs(OUT, exist_ok=True)

PAPER = (245, 239, 227, 255)   # 纸感浅底
INK = (58, 51, 42, 255)        # 墨色
ACCENT = (198, 108, 56, 255)   # 陶土色点缀
LINE = (214, 203, 184, 255)    # 细线


def font(size: int):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "simsun.ttc"):
        p = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return None


def draw_glyph(d: ImageDraw.ImageDraw, x: int, y: int, scale: float):
    """项目管理字形：三条不同高度的任务条 + 一条里程碑短横。"""
    bar_w = int(46 * scale)
    gap = int(26 * scale)
    heights = [int(74 * scale), int(124 * scale), int(96 * scale)]
    base_y = y + int(130 * scale)
    for i, h in enumerate(heights):
        bx = x + i * (bar_w + gap)
        d.rounded_rectangle(
            [bx, base_y - h, bx + bar_w, base_y],
            radius=int(10 * scale),
            fill=INK,
        )
    # 里程碑短横（陶土色）
    mx = x + int(10 * scale)
    d.rounded_rectangle(
        [mx, base_y + int(20 * scale), x + int(180 * scale), base_y + int(32 * scale)],
        radius=int(6 * scale),
        fill=ACCENT,
    )


def make_icon(size: int = 512) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(size * 0.06)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.22), fill=PAPER, outline=LINE, width=max(2, size // 128))
    scale = size / 512.0
    draw_glyph(d, int(size * 0.24), int(size * 0.20), scale * 1.35)
    return img


def make_cover(w: int = 1200, h: int = 630) -> Image.Image:
    img = Image.new("RGBA", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    # 细边框，纸质印刷感
    m = 18
    d.rectangle([m, m, w - m, h - m], outline=LINE, width=3)
    draw_glyph(d, 120, int(h * 0.34), 1.5)
    f = font(76)
    if f:
        d.text((430, h // 2 - 70), "项目管理", font=f, fill=INK)
        f2 = font(32)
        if f2:
            d.text((432, h // 2 + 28), "Project Management", font=f2, fill=(122, 110, 94, 255))
    return img


def main() -> None:
    icon = make_icon()
    icon.save(os.path.join(OUT, "icon.png"))
    cover = make_cover()
    cover.save(os.path.join(OUT, "cover.png"))
    print("written:", os.path.join(OUT, "icon.png"), os.path.join(OUT, "cover.png"))


if __name__ == "__main__":
    main()
