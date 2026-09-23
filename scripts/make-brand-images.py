#!/usr/bin/env python3
"""
잔별 — 공유 썸네일 / 앱 아이콘 생성기
---------------------------------------------------------------
한 번 실행하면 public/ 아래에 공유용 이미지 한 벌이 만들어집니다.

    python3 scripts/make-brand-images.py

만들어지는 것
  public/og-image.png        1200x630  카카오톡·문자·트위터·슬랙 미리보기
  public/og-image-square.png  800x800  1:1 미리보기를 쓰는 앱 대비
  public/icon-192.png                  PWA 아이콘
  public/icon-512.png                  PWA 아이콘 / 스토어 제출용 원본
  public/apple-touch-icon.png 180x180  iOS 홈화면
  public/favicon.png           64x64

색은 src/index.css 의 값을 그대로 옮겨왔습니다. 문구를 바꾸고 싶으면
아래 TITLE / TAGLINE 만 고치면 됩니다.
"""

import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── 브랜드 값 (src/index.css 와 동일) ──────────────────────────
VOID = (4, 5, 10)
STARDUST = (226, 214, 255)
STARDUST_HI = (239, 231, 255)
MIST = (126, 138, 166)
MIST_HI = (174, 184, 210)
WARM = (255, 176, 103)

# 마음의 색 (src/lib/emotionColor.js)
EMOTION = [
    (255, 226, 150),  # 기쁨
    (170, 232, 214),  # 평온
    (246, 184, 212),  # 그리움
    (140, 178, 255),  # 슬픔
    (184, 164, 255),  # 고독
    (226, 204, 176),  # 피로
    (255, 158, 140),  # 불안
    (222, 230, 248),  # 일상
]

TITLE = "잔별"
TAGLINE = ["별거 아닌 줄 알았던 당신의 오늘이,", "이곳에선 누군가의 밤을 비추는 잔별이 됩니다."]

SERIF = ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", 1)
SERIF_MED = ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Medium.ttc", 1)
SANS_LIGHT = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Light.ttc", 1)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")


def font(spec, size):
    path, index = spec
    return ImageFont.truetype(path, size, index=index)


# ── 밤하늘 ────────────────────────────────────────────────────
def night_sky(w, h, seed=7, density=1.0, spiral=True):
    """깊은 우주 바탕 + 나선 팔 위의 잔별들."""
    rnd = random.Random(seed)
    img = Image.new("RGB", (w, h), VOID)

    # 은은한 성운 — 큰 원을 여러 장 깔고 흐리게
    neb = Image.new("RGB", (w, h), VOID)
    nd = ImageDraw.Draw(neb)
    for cx, cy, r, col in [
        (w * 0.30, h * 0.42, max(w, h) * 0.55, (20, 18, 48)),
        (w * 0.72, h * 0.62, max(w, h) * 0.45, (12, 22, 46)),
        (w * 0.55, h * 0.18, max(w, h) * 0.38, (26, 16, 40)),
    ]:
        nd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    neb = neb.filter(ImageFilter.GaussianBlur(max(w, h) * 0.13))
    img = Image.blend(img, neb, 0.72)

    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    d = ImageDraw.Draw(img)

    def star(x, y, r, col, halo=2.6):
        gd.ellipse([x - r * halo, y - r * halo, x + r * halo, y + r * halo],
                   fill=tuple(int(c * 0.30) for c in col))
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)

    # 배경 먼지별
    for _ in range(int(900 * density)):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        r = rnd.uniform(0.5, 1.5)
        v = rnd.uniform(0.25, 0.70)
        star(x, y, r, tuple(int(c * v) for c in (200, 212, 240)), halo=1.8)

    # 나선 팔 — 잔별이 모여 이루는 은하
    if spiral:
        cx, cy = w * 0.5, h * 0.52
        scale = min(w, h) * 0.85
        for arm in range(3):
            base = arm * (2 * math.pi / 3)
            for i in range(int(150 * density)):
                t = i / (150 * density)
                ang = base + t * 2.5
                rad = (0.10 + t * 0.62) * scale
                jx = rnd.gauss(0, scale * 0.035)
                jy = rnd.gauss(0, scale * 0.030)
                x = cx + math.cos(ang) * rad + jx
                y = cy + math.sin(ang) * rad * 0.62 + jy
                if not (-20 < x < w + 20 and -20 < y < h + 20):
                    continue
                col = EMOTION[rnd.randrange(len(EMOTION))]
                v = rnd.uniform(0.35, 1.0)
                r = rnd.uniform(0.8, 2.4)
                star(x, y, r, tuple(int(c * v) for c in col))

    # 온기를 많이 받은 큰 별 몇 개
    for _ in range(int(9 * density)):
        x, y = rnd.uniform(w * 0.05, w * 0.95), rnd.uniform(h * 0.08, h * 0.92)
        col = EMOTION[rnd.randrange(len(EMOTION))]
        star(x, y, rnd.uniform(2.6, 3.8), col, halo=5.0)

    glow = glow.filter(ImageFilter.GaussianBlur(max(w, h) * 0.012))
    img = Image.blend(img, Image.new("RGB", (w, h), (0, 0, 0)), 0.0)
    img = Image.fromarray(
        __import__("numpy").clip(
            __import__("numpy").asarray(img, dtype=int)
            + __import__("numpy").asarray(glow, dtype=int),
            0, 255,
        ).astype("uint8")
    )
    return img


def vignette(img, strength=0.55):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse(
        [-w * 0.25, -h * 0.35, w * 1.25, h * 1.35], fill=255
    )
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.18))
    dark = Image.new("RGB", (w, h), VOID)
    return Image.composite(img, Image.blend(img, dark, strength), mask)


# ── 공유 썸네일 ───────────────────────────────────────────────
def make_og(w=1200, h=630, path="og-image.png", compact=False):
    img = vignette(night_sky(w, h, seed=11, density=1.0))
    d = ImageDraw.Draw(img)

    title_size = int(h * (0.20 if not compact else 0.17))
    f_title = font(SERIF_MED, title_size)
    f_tag = font(SANS_LIGHT, int(h * (0.042 if not compact else 0.038)))
    f_mark = font(SANS_LIGHT, int(h * 0.030))

    cx = w / 2
    block_h = title_size * 1.25 + len(TAGLINE) * (f_tag.size * 1.85) + h * 0.05
    top = (h - block_h) / 2

    # 글자 자리를 살짝 가라앉혀 대비를 확보 (별밭 위에서도 글이 읽히도록)
    import numpy as np
    scrim = Image.new("L", (w, h), 0)
    ImageDraw.Draw(scrim).ellipse(
        [cx - w * 0.40, top - h * 0.10, cx + w * 0.40, top + block_h + h * 0.06],
        fill=210,
    )
    scrim = scrim.filter(ImageFilter.GaussianBlur(min(w, h) * 0.10))
    img = Image.composite(Image.blend(img, Image.new("RGB", (w, h), VOID), 0.55), img, scrim)
    d = ImageDraw.Draw(img)

    # 제목 뒤 은은한 빛
    halo = Image.new("RGB", (w, h), (0, 0, 0))
    ImageDraw.Draw(halo).ellipse(
        [cx - w * 0.22, top - h * 0.02, cx + w * 0.22, top + title_size * 1.4],
        fill=(30, 24, 58),
    )
    halo = halo.filter(ImageFilter.GaussianBlur(w * 0.05))
    img = Image.fromarray(
        np.clip(np.asarray(img, int) + np.asarray(halo, int), 0, 255).astype("uint8")
    )
    d = ImageDraw.Draw(img)

    d.text((cx, top), TITLE, font=f_title, fill=STARDUST_HI, anchor="ma")

    y = top + title_size * 1.30
    # 얇은 구분선
    d.line([(cx - w * 0.06, y), (cx + w * 0.06, y)], fill=(90, 100, 135), width=1)
    y += h * 0.045

    for line in TAGLINE:
        d.text((cx, y), line, font=f_tag, fill=(206, 214, 234), anchor="ma")
        y += f_tag.size * 1.85

    # 아래쪽 작은 서명
    d.text((cx, h - h * 0.075), "오늘의 잔별 하나 띄우기", font=f_mark,
           fill=(148, 158, 184), anchor="ma")

    img.save(os.path.join(OUT, path), "PNG", optimize=True)
    # 인스타/일부 스크래퍼용 JPEG 사본
    img.convert("RGB").save(
        os.path.join(OUT, path.replace(".png", ".jpg")), "JPEG", quality=90
    )
    print("  ", path, img.size)


def make_square(size=800):
    img = vignette(night_sky(size, size, seed=23, density=1.1))
    d = ImageDraw.Draw(img)
    f_title = font(SERIF_MED, int(size * 0.20))
    f_tag = font(SANS_LIGHT, int(size * 0.043))
    cy = size * 0.44
    d.text((size / 2, cy), TITLE, font=f_title, fill=STARDUST_HI, anchor="ma")
    y = cy + size * 0.26
    d.line([(size * 0.42, y), (size * 0.58, y)], fill=(90, 100, 135), width=1)
    y += size * 0.055
    d.text((size / 2, y), "사소한 하루가 별이 되는 곳", font=f_tag,
           fill=MIST_HI, anchor="ma")
    img.save(os.path.join(OUT, "og-image-square.png"), "PNG", optimize=True)
    print("   og-image-square.png", img.size)


# ── 아이콘 ────────────────────────────────────────────────────
def make_icon(size, path, pad_ratio=0.0):
    img = vignette(night_sky(size, size, seed=5, density=0.5, spiral=True), 0.35)
    d = ImageDraw.Draw(img)
    # 마스커블 아이콘 대비 — 글자는 안쪽 60% 안에만 둡니다
    f = font(SERIF_MED, int(size * 0.32))
    d.text((size / 2, size * 0.50), TITLE, font=f, fill=STARDUST_HI, anchor="mm")
    img.save(os.path.join(OUT, path), "PNG", optimize=True)
    print("  ", path, img.size)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("잔별 이미지 생성 →", os.path.normpath(OUT))
    make_og()
    make_square()
    make_icon(512, "icon-512.png")
    make_icon(192, "icon-192.png")
    make_icon(180, "apple-touch-icon.png")
    make_icon(64, "favicon.png")
    print("끝. public/ 을 그대로 배포하면 됩니다.")
