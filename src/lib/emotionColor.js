/**
 * 마음의 색 — 별의 색은 그 이야기가 품은 마음입니다
 * ---------------------------------------------------------------
 * 감정은 affinity.js가 글에서 읽어낸 것을 그대로 씁니다 (선을 긋는 기준과 같은 눈).
 * 여러 마음이 섞여 있으면 글에서 먼저 잡힌 마음 하나를 색으로 삼아요.
 *
 * 밤하늘에서 서로 헷갈리지 않으면서, 어느 것도 튀지 않도록 모두 옅은 파스텔입니다.
 * 온기는 색이 아니라 **밝기와 크기**로 말합니다 (여기에 따뜻한 기운이 조금만 섞여요).
 */
import { facetsOfStar } from './affinity.js'

export const EMOTION_COLORS = {
  기쁨: [255, 226, 150], // 옅은 금빛
  평온: [170, 232, 214], // 새벽 물빛
  그리움: [246, 184, 212], // 옅은 장밋빛
  슬픔: [140, 178, 255], // 푸른빛
  고독: [184, 164, 255], // 보랏빛
  피로: [226, 204, 176], // 해 질 녘 모래빛
  불안: [255, 158, 140], // 옅은 산호빛
  일상: [222, 230, 248], // 흰 별빛
}

/** 화면에 보여줄 순서 (안내의 작은 범례) */
export const EMOTION_ORDER = ['기쁨', '평온', '그리움', '슬픔', '고독', '피로', '불안', '일상']

const TAG_FALLBACK = ['기쁨', '슬픔', '고독', '피로']

/** 이 별의 마음 하나 */
export function emotionOf(star) {
  const found = facetsOfStar(star).emotions[0]?.key
  if (found) return found
  const tag = (star.tags || []).find((t) => TAG_FALLBACK.includes(t))
  return tag || '일상'
}

export function emotionRGB(star) {
  return EMOTION_COLORS[emotionOf(star)] || EMOTION_COLORS.일상
}

export const cssColor = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`
