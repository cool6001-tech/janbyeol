/**
 * 오늘의 잔별 카드 그리기 — 1080x1350 (인스타 세로 4:5)
 * ---------------------------------------------------------------
 * daily-instagram.mjs 와 개별 별 공유 썸네일이 같은 그림을 씁니다.
 * 혼자 돌려보려면:  node scripts/lib/card.mjs
 */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* 마음의 색 — src/lib/emotionColor.js 와 같은 값 */
const EMOTION_COLORS = {
  기쁨: [255, 226, 150],
  평온: [170, 232, 214],
  그리움: [246, 184, 212],
  슬픔: [140, 178, 255],
  고독: [184, 164, 255],
  피로: [226, 204, 176],
  불안: [255, 158, 140],
  일상: [222, 230, 248],
}

export function registerFonts() {
  // ⚠️ 한글 폰트를 등록하지 않으면 글자가 전부 □□□ 로 나옵니다.
  //    캔버스는 브라우저가 아니라서 웹폰트를 못 불러옵니다.
  //
  // 가장 확실한 방법: 폰트 파일을 저장소에 함께 넣어두기
  //    assets/fonts/GowunBatang-Regular.ttf   (fonts.google.com/specimen/Gowun+Batang)
  //    assets/fonts/NotoSansKR-Light.ttf      (fonts.google.com/noto/specimen/Noto+Sans+KR)
  // 둘 다 OFL 라이선스라 상업적으로 써도 됩니다.
  // 저장소의 assets/fonts 를 먼저 봅니다. 없으면 시스템 폰트로 버팁니다.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dirs = [
    path.join(here, '..', '..', 'assets', 'fonts'), // 이 파일 기준 (서버리스 함수에서도 맞음)
    path.join(process.cwd(), 'assets', 'fonts'), // 저장소 루트에서 실행할 때
  ]
  const at = (name) => dirs.map((d) => path.join(d, name))

  const candidates = {
    Gowun: [
      ...at('GowunBatang-Regular.ttf'), // 화면과 같은 글꼴을 직접 넣었다면 이게 먼저
      ...at('JanbyeolSerif-KR.otf'), // 같이 들어 있는 서브셋
      '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', // 리눅스 대체
      '/System/Library/Fonts/AppleSDGothicNeo.ttc', // 맥 대체
    ],
    NotoKR: [
      ...at('NotoSansKR-Light.ttf'),
      ...at('JanbyeolSans-KR.otf'),
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Light.ttc',
      '/System/Library/Fonts/AppleSDGothicNeo.ttc',
    ],
  }

  for (const [alias, paths] of Object.entries(candidates)) {
    const found = paths.find((p) => {
      try {
        return GlobalFonts.registerFromPath(p, alias)
      } catch {
        return false
      }
    })
    if (!found) {
      console.warn(
        `[잔별] '${alias}' 한글 폰트를 찾지 못했습니다. ` +
          `assets/fonts/ 를 확인해주세요 — 없으면 카드 글자가 전부 □□□ 로 나옵니다. ` +
          `python3 scripts/subset-fonts.py 로 다시 만들 수 있습니다.`
      )
    }
  }
}

export function wrapKorean(ctx, text, maxWidth) {
  // 한국어는 단어 사이 공백이 드물어 글자 단위로 끊습니다.
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line)
      line = ''
      continue
    }
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export function drawCard(star) {
  const W = 1080
  const H = 1350
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // 깊은 우주
  ctx.fillStyle = '#04050a'
  ctx.fillRect(0, 0, W, H)
  const neb = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.85)
  neb.addColorStop(0, 'rgba(38, 30, 78, 0.85)')
  neb.addColorStop(0.55, 'rgba(14, 16, 42, 0.6)')
  neb.addColorStop(1, 'rgba(4, 5, 10, 0)')
  ctx.fillStyle = neb
  ctx.fillRect(0, 0, W, H)

  // 별밭 — 글의 id로 씨앗을 만들어 같은 글은 늘 같은 하늘을 갖습니다
  let seed = [...star.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const palette = Object.values(EMOTION_COLORS)
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const r = rnd() * 1.8 + 0.4
    const [cr, cg, cb] = palette[Math.floor(rnd() * palette.length)]
    ctx.globalAlpha = 0.25 + rnd() * 0.65
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 글이 놓일 자리는 조금 가라앉혀 읽히게
  const scrim = ctx.createLinearGradient(0, H * 0.18, 0, H * 0.86)
  scrim.addColorStop(0, 'rgba(4,5,10,0)')
  scrim.addColorStop(0.25, 'rgba(4,5,10,0.72)')
  scrim.addColorStop(0.75, 'rgba(4,5,10,0.72)')
  scrim.addColorStop(1, 'rgba(4,5,10,0)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, H * 0.18, W, H * 0.68)

  // 이 별의 마음 색
  const [er, eg, eb] = EMOTION_COLORS[star.emotion] ?? EMOTION_COLORS.일상

  // 본문
  const body = (star.text || '').trim()
  const size = body.length > 160 ? 40 : body.length > 90 ? 48 : 56
  ctx.font = `${size}px Gowun, serif`
  ctx.fillStyle = '#efe7ff'
  ctx.textAlign = 'center'
  const lines = wrapKorean(ctx, body, W - 200)
  const lh = size * 1.78
  let y = H / 2 - (lines.length - 1) * lh * 0.5
  for (const line of lines) {
    ctx.fillText(line, W / 2, y)
    y += lh
  }

  // 위: 마음 한 글자
  ctx.font = '30px NotoKR, sans-serif'
  ctx.fillStyle = `rgba(${er},${eg},${eb},0.9)`
  ctx.fillText(star.emotion ?? '일상', W / 2, H * 0.245)

  // 아래: 온기 + 서명
  ctx.font = '32px NotoKR, sans-serif'
  ctx.fillStyle = 'rgba(255,176,103,0.92)'
  ctx.fillText(`온기 ${star.warmth}`, W / 2, H * 0.80)

  ctx.font = '26px NotoKR, sans-serif'
  ctx.fillStyle = 'rgba(126,138,166,0.9)'
  ctx.fillText('잔별 · janbyeol', W / 2, H * 0.90)

  // 인스타는 JPEG만 받습니다
  return canvas.encode('jpeg', 92)
}

/* 혼자 돌려보기 — 샘플 카드 한 장을 out/card.jpg 로 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs/promises')
  registerFonts()
  const buf = await drawCard({
    id: 's-sample-0001',
    text: '오늘 퇴근길에 올려다본 하늘이 유난히 맑았다. 별거 아닌 하루였는데, 그 하늘 하나로 괜찮아졌다.',
    tags: ['일상', '평온'],
    emotion: '평온',
    warmth: 42,
  })
  await fs.mkdir('out', { recursive: true })
  await fs.writeFile('out/card.jpg', buf)
  console.log('out/card.jpg')
}
