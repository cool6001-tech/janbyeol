#!/usr/bin/env python3
"""
카드용 한글 폰트 줄이기
---------------------------------------------------------------
Noto CJK 원본은 한 벌에 16MB쯤 됩니다. 그대로는 저장소에도 무겁고
Vercel 함수 용량에도 안 들어갑니다. 한글 음절 전체와 ASCII,
자주 쓰는 문장부호만 남겨서 합쳐 5MB 아래로 만듭니다.

    pip install fonttools
    python3 scripts/subset-fonts.py

리눅스 기준 경로입니다. 맥이라면 아래 SOURCES 의 경로를 직접 받은
Noto CJK 파일로 바꿔주세요. (음절을 통째로 남기므로 어떤 글자가
들어와도 깨지지 않습니다 — 사람들이 뭘 쓸지 모르니까요.)
"""

import os
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "fonts")

# (원본 파일, TTC 안에서 한국어 얼굴의 번호, 내보낼 이름)
SOURCES = [
    ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Medium.ttc", 1, "JanbyeolSerif-KR.otf"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Light.ttc", 1, "JanbyeolSans-KR.otf"),
]


def wanted_chars():
    chars = []
    chars += [chr(c) for c in range(0xAC00, 0xD7A4)]  # 한글 음절 11,172자 — 전부
    chars += [chr(c) for c in range(0x3131, 0x3164)]  # 호환 자모 (ㄱ ㄴ ㄷ …)
    chars += [chr(c) for c in range(0x0020, 0x007F)]  # ASCII
    chars += list("·…‘’“”―—–×÷°※→←↑↓♥★☆•　，、。！？：；")
    return "".join(chars)


def main():
    os.makedirs(OUT, exist_ok=True)
    text = wanted_chars()

    for src, index, name in SOURCES:
        if not os.path.exists(src):
            print(f"건너뜀 — 원본이 없습니다: {src}")
            continue

        font = TTFont(src, fontNumber=index)
        opts = subset.Options()
        opts.desubroutinize = False  # 켜면 파일이 두 배로 붑니다
        opts.layout_features = ["kern", "vert", "vrt2", "liga"]
        opts.drop_tables += ["DSIG"]
        opts.notdef_outline = True
        opts.recalc_bounds = False

        s = subset.Subsetter(options=opts)
        s.populate(text=text)
        s.subset(font)

        path = os.path.join(OUT, name)
        font.save(path)
        print(f"{name}  {os.path.getsize(path) / 1024 / 1024:.1f}MB")


if __name__ == "__main__":
    main()
