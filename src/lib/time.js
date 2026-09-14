/**
 * 시간
 * ---------------------------------------------------------------
 * 띄운 시각이 저장되는 순간, 시간 자체가 데이터가 됩니다.
 * 흐려지는 별 · 작년 오늘의 별 · 감정의 궤적이 전부 여기서 나옵니다.
 */

const DAY = 86400000

export function daysSince(iso, now = Date.now()) {
  return (now - new Date(iso).getTime()) / DAY
}

/**
 * 흐려지는 별 — 오래된 잔별일수록 어둡게.
 * 최근의 마음은 밝고, 오래된 마음은 아득하게 남습니다.
 * 0으로는 절대 가지 않습니다. 기억은 흐려질 뿐 사라지지 않으니까요.
 */
export function ageFade(iso, now = Date.now()) {
  const d = daysSince(iso, now)
  if (d <= 3) return 1
  const t = Math.min(1, (d - 3) / 540) // 약 1년 6개월에 걸쳐 저문다
  return 1 - 0.62 * Math.pow(t, 0.75)
}

/** 작년 오늘의 별 — 날짜(월·일)가 맞고 1년 이상 지난 잔별 */
export function isAnniversary(iso, now = Date.now()) {
  const then = new Date(iso)
  const today = new Date(now)
  if (daysSince(iso, now) < 350) return false
  return then.getMonth() === today.getMonth() && then.getDate() === today.getDate()
}

export function yearsAgo(iso, now = Date.now()) {
  return Math.max(1, Math.round(daysSince(iso, now) / 365))
}

/** 사람이 읽는 시각 */
export function relativeWhen(iso, now = Date.now()) {
  const ms = now - new Date(iso).getTime()
  const min = ms / 60000
  if (min < 1) return '방금'
  if (min < 60) return `${Math.floor(min)}분 전`
  const hr = min / 60
  if (hr < 24) return `${Math.floor(hr)}시간 전`
  const d = hr / 24
  if (d < 7) return `${Math.floor(d)}일 전`
  if (d < 30) return `${Math.floor(d / 7)}주 전`
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return sameYear
    ? `${date.getMonth() + 1}월 ${date.getDate()}일`
    : `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

export function monthKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  return `${Number(key.slice(5))}월`
}

/** 최근 12개월의 키를 오래된 순으로 */
export function lastTwelveMonths(now = Date.now()) {
  const out = []
  const d = new Date(now)
  d.setDate(1)
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
