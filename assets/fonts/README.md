# 카드 그리기용 폰트

캔버스는 브라우저가 아니라서 **웹폰트를 불러오지 못합니다.**
그래서 인스타 카드와 공유 썸네일에 쓸 폰트 파일이 저장소 안에 있어야 합니다.
없으면 글자가 전부 □□□ 로 나옵니다.

## 지금 들어 있는 것

| 파일 | 원본 | 쓰는 곳 |
|---|---|---|
| `JanbyeolSerif-KR.otf` | Noto Serif CJK KR (Medium) | 카드 본문 — 화면의 Gowun Batang 자리 |
| `JanbyeolSans-KR.otf` | Noto Sans CJK KR (Light) | 감정·온기·서명 |

둘 다 한글 음절 전체(11,172자)와 ASCII, 자주 쓰는 문장부호만 남기고
잘라낸 **서브셋**입니다. 원본이 각 16MB 남짓이라 그대로 두면
Vercel 함수에 들어가지 않습니다. 지금은 합쳐서 5MB 아래입니다.

라이선스는 **SIL Open Font License 1.1** 입니다. 서브셋을 만들어
재배포하는 것도 OFL이 허용합니다. 원본과 라이선스 전문은
<https://github.com/notofonts/noto-cjk> 에 있습니다.

## 화면 폰트와 똑같이 맞추고 싶다면

웹 화면은 **Gowun Batang**을 씁니다. 카드도 같은 글꼴로 맞추고 싶으면
[fonts.google.com/specimen/Gowun+Batang](https://fonts.google.com/specimen/Gowun+Batang)
에서 받아 이 폴더에 `GowunBatang-Regular.ttf` 로 두세요.
`scripts/lib/card.mjs` 가 그 파일이 있으면 먼저 씁니다. (Gowun Batang도 OFL입니다.)

## 다시 만들고 싶을 때

```bash
python3 scripts/subset-fonts.py
```
