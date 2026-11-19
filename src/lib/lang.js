/**
 * 읽는 사람의 말
 * ---------------------------------------------------------------
 * 잔별은 누가 어느 나라 말로 썼든 같은 마음이면 가까이 둡니다.
 * 그런데 가까이 있어도 못 읽으면 소용이 없어요. 그래서 '옮겨 읽기'가 있고,
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
 * 이 별을 내 말로 옮겨 읽을 수 있는가.
 *
 * 서버가 적어둔 lang 이 없으면 **보여주지 않습니다.** 모르면 가만히 있는 쪽이
 * 낫습니다 — 한국어로 쓴 글에 "한국어로 옮겨 읽기"가 붙어 있으면 이상하니까요.
 * (아직 embed-star 가 안 훑은 옛 별들이 여기 해당합니다)
 */
export function isForeign(star) {
  const lang = star?.lang
  if (!lang) return false
  return lang !== myLanguage()
}
