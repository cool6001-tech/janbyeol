/**
 * 읽는 사람의 말
 * ---------------------------------------------------------------
 * 잔별은 누가 어느 나라 말로 썼든 같은 마음이면 가까이 둡니다.
 * 그런데 가까이 있어도 못 읽으면 소용이 없어요. 그래서 '번역하기'가 있고,
 * 그걸 보여줄지 말지를 여기서 정합니다.
 */

/** 브라우저가 쓰는 말. 'ko-KR' 같은 값에서 앞 두 글자만. */
export function myLanguage() {
  try {
    const raw = navigator.languages?.[0] || navigator.language || 'ko'
    return String(raw).toLowerCase().split('-')[0] || 'ko'
  } catch {
    return 'ko'
  }
}

/**
 * 무슨 글자로 쓰였는가 — 글자 모양만 봅니다.
 *
 * 서버(embed-star)도 똑같은 규칙으로 봅니다. 여기서 한 번 더 보는 이유는
 * **서버가 아직 못 훑은 별** 때문입니다. 방금 띄운 별은 몇 초 동안 lang 이
 * 비어 있는데, 그 사이에 번역 버튼이 사라져 있으면 "왜 안 뜨지" 가 됩니다.
 *
 * 비율이 아니라 있는지 없는지로 봅니다 — 한 문장에 여러 글자를 섞어 쓰는
 * 사람이 많으니까요. 한글이 한 자라도 있으면 한국어로 봅니다.
 */
export function langOfText(text = '') {
  if (/[가-힣ᄀ-ᇿ]/.test(text)) return 'ko'
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja'
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'
  if (/[฀-๿]/.test(text)) return 'th'
  if (/[؀-ۿ]/.test(text)) return 'ar'
  if (/[a-z]/i.test(text)) return 'en'
  return '' // 숫자나 기호뿐 — 번역할 말이 없습니다
}

/** 이 별을 쓴 말. 서버가 적어둔 값이 먼저, 없으면 글자를 보고 짐작합니다. */
export function langOfStar(star) {
  return star?.lang || langOfText(star?.text || '')
}

/** 내 말로 옮겨 읽을 수 있는 별인가 */
export function isForeign(star) {
  const lang = langOfStar(star)
  return Boolean(lang) && lang !== myLanguage()
}
