#!/usr/bin/env python3
"""把纯白底的装备图抠成透明底，裁掉多余空白、缩放并保存。

原则：**只有背景要透明**。背景 = 与画面四边连通、且接近纯白的像素，
用泛洪（flood fill）找出来；被物体围在里面的白色高光、白瓷、
中空部分一律保留为不透明。物体内部任何像素的 alpha 都是 1。

用法：
    python3 tools/cutout.py 原图.jpg 成品.webp 512 --report
可选参数：
    --thresh 0.92   判定为“背景白”的阈值（0~1，越大越严格）
    --pad 0.06      裁剪后四周留白，占成品边长的比例
    --no-trim       不裁边，只抠图并缩放
"""
import argparse
import sys
from collections import deque

import numpy as np
from PIL import Image


# ---------------------------------------------------------------- 读图

def load_rgb(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return im.convert("RGB")


# ------------------------------------------------------------ 背景识别

def _flood(passable):
    """从四边出发、在 passable 为真的像素里泛洪，返回能到达的像素掩码。"""
    h, w = passable.shape
    seen = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        if y > 0 and passable[y - 1, x] and not seen[y - 1, x]:
            seen[y - 1, x] = True
            dq.append((y - 1, x))
        if y < h - 1 and passable[y + 1, x] and not seen[y + 1, x]:
            seen[y + 1, x] = True
            dq.append((y + 1, x))
        if x > 0 and passable[y, x - 1] and not seen[y, x - 1]:
            seen[y, x - 1] = True
            dq.append((y, x - 1))
        if x < w - 1 and passable[y, x + 1] and not seen[y, x + 1]:
            seen[y, x + 1] = True
            dq.append((y, x + 1))
    return seen


def background_mask(rgb, thresh):
    """背景 = 从四边连通过的近白色像素（被物体围住的白色不算背景）。"""
    arr = rgb.astype(np.float32) / 255.0
    mn = arr.min(axis=2)
    return _flood(mn >= thresh)


def largest_component(mask):
    """只保留最大的连通块（前景），去掉零碎噪点。"""
    h, w = mask.shape
    out = np.zeros_like(mask)
    seen = np.zeros_like(mask)
    best, best_size = None, 0
    for sy in range(0, h, 4):
        for sx in range(0, w, 4):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            dq = deque([(sy, sx)])
            seen[sy, sx] = True
            while dq:
                y, x = dq.popleft()
                comp.append((y, x))
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        dq.append((ny, nx))
            if len(comp) > best_size:
                best_size, best = len(comp), comp
    if best:
        for y, x in best:
            out[y, x] = True
    return out


# ------------------------------------------------------------ 边缘处理

def _shift(mask, dy, dx):
    """把掩码平移 (dy, dx)，移出去的部分填 False。"""
    h, w = mask.shape
    out = np.zeros_like(mask)
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = mask[ys, xs]
    return out


def _neighbors(mask):
    """4 邻域里只要有一个为真，就算和该集合相邻。"""
    n = np.zeros_like(mask)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n |= _shift(mask, dy, dx)
    return n


def cut(rgb, thresh):
    """返回 (rgba float 数组, 前景掩码, 背景掩码)。只有背景 alpha=0。"""
    arr = rgb.astype(np.float32) / 255.0
    bg = background_mask(rgb, thresh)
    fg = largest_component(~bg)
    if not fg.any():
        return None, fg, bg

    # 1) 紧贴背景的一圈像素里，去掉混进来的白边颜色
    rim = fg & _neighbors(bg)
    mn = arr.min(axis=2)
    dewhite = rim & (mn > 0.78)
    if dewhite.any():
        w_ = np.clip((mn[dewhite] - 0.78) / 0.22, 0, 1)  # 1 = 几乎全白，最像背景
        a = np.maximum(1.0 - w_, 0.05)[:, None]
        arr[dewhite] = np.clip((arr[dewhite] - (1.0 - a)) / a, 0, 1)

    # 2) alpha：背景 0，其余全 1。最外一圈给 0.6，缩放后边缘不锯齿，
    #    但物体内部（包括内部白色高光）永远是 1。
    alpha = np.where(fg, 1.0, 0.0).astype(np.float32)
    alpha[rim] = 0.6
    return np.dstack([np.clip(arr, 0, 1), alpha]), fg, bg


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("size", nargs="?", type=int, default=512)
    ap.add_argument("--thresh", type=float, default=0.92)
    ap.add_argument("--pad", type=float, default=0.06)
    ap.add_argument("--no-trim", action="store_true")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()

    rgb = load_rgb(a.src)
    rgba, fg, bg = cut(np.asarray(rgb), a.thresh)
    if rgba is None:
        print("ERROR: 没找到前景，检查背景是否为纯白色", file=sys.stderr)
        return 1

    img = Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")

    # 裁到内容外接框，按内容长边缩放，再居中放进正方形画布
    if not a.no_trim:
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
    side = int(round(max(img.size) * (1 + 2 * a.pad)))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2), img)
    out = canvas.resize((a.size, a.size), Image.LANCZOS)

    # 缩放后把极低 alpha 的残留噪点清零
    o = np.asarray(out).astype(np.float32)
    o[..., 3][o[..., 3] < 8] = 0
    out = Image.fromarray(o.round().astype(np.uint8), "RGBA")

    if a.dst.lower().endswith(".webp"):
        out.save(a.dst, "WEBP", quality=92, method=6)
    else:
        out.save(a.dst)

    if a.report:
        al = np.asarray(out)[..., 3]
        cover = float((al > 0).mean())
        corners = [int(al[0, 0]), int(al[0, -1]), int(al[-1, 0]), int(al[-1, -1])]
        print(
            f"OK {a.dst}  {out.size[0]}x{out.size[1]}  前景占比 {cover:.1%}  "
            f"四角 alpha {corners}  背景像素 {int(bg.sum())}"
        )
        if max(corners) > 0:
            print("WARN: 四角不是全透明，背景可能不干净", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
