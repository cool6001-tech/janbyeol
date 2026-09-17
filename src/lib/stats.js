/**
 * 회고 — 저장된 기록을 읽어 의미로 바꾸는 곳
 */

import { monthKey, lastTwelveMonths, isAnniversary } from './time.js'
import { affinityOf } from './affinity.js'

export function myStars(stars, myId) {
  return stars
    .filter((s) => s.authorId === myId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * 나의 성단 요약
 * - 받은 온기 누적: "별거 아니라 생각한 이 한 줄이 몇 명의 밤을 비췄는지"
 * - 감정의 궤적: 어떤 마음이 많았는지, 어느 달에 몰렸는지
 * - 작년 오늘의 별: 날짜가 맞아떨어지는 예전의 나
 */
export function myConstellation(stars, myId, now = Date.now()) {
  const mine = myStars(stars, myId)

  let warmth = 0
  let starlight = 0
  const tagCount = new Map()
  const monthCount = new Map()

  for (const s of mine) {
    warmth += s.warmth || 0
    starlight += (s.replies || []).length
    for (const tag of s.tags) tagCount.set(tag, (tagCount.get(tag) || 0) + 1)
    const key = monthKey(s.createdAt)
    monthCount.set(key, (monthCount.get(key) || 0) + 1)
  }

  const tagRanking = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  const months = lastTwelveMonths(now).map((key) => ({
    key,
    count: monthCount.get(key) || 0,
  }))

  const anniversaries = mine.filter((s) => isAnniversary(s.createdAt, now))
  const anniversaryIds = new Set(anniversaries.map((s) => s.id))

  // 작년 오늘의 별은 따로 보여주므로, 가장 밝은 잔별에서는 빼서 겹치지 않게 한다
  const brightest = mine
    .filter((s) => !anniversaryIds.has(s.id))
    .reduce((best, s) => (!best || (s.warmth || 0) > (best.warmth || 0) ? s : best), null)

  return {
    mine,
    count: mine.length,
    warmth,
    starlight,
    tagRanking,
    months,
    brightest: brightest && brightest.warmth > 0 ? brightest : null,
    anniversaries,
  }
}

/**
 * 방금 띄운 잔별과 마음이 닮은 잔별들 (공감 성단의 재료).
 * 닮음의 기준은 은하의 연결선과 같습니다 — 소재와 감정을 함께 본 0~10점.
 */
export function findKindred(stars, target, limit = 5) {
  const scored = stars
    .filter((s) => s.id !== target.id)
    .map((s) => ({ star: s, score: affinityOf(target, s) }))
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)

  // 닮은 별이 모자라면, 가까이 있는 별이라도 곁에 둔다
  if (scored.length < limit) {
    for (const s of stars) {
      if (scored.length >= limit) break
      if (s.id === target.id) continue
      if (scored.some((x) => x.star.id === s.id)) continue
      scored.push({ star: s, score: 0 })
    }
  }

  return scored.slice(0, limit).map((s) => s.star)
}

/**
 * 오늘 빛나는 별 — 전체 은하에서 사람들의 마음이 가장 많이 머문 이야기들
 *
 * 온기를 '언제' 받았는지는 아직 기록하지 않아서, 받은 온기와 이어진 별빛을
 * **최근일수록 무겁게** 셉니다. 열흘 전 별은 오늘 별의 절반 무게예요.
 * 서버에서 온기마다 시각을 남기게 되면 이 함수만 '오늘 받은 온기'로 바꾸면 됩니다.
 */
export function shiningStars(stars, limit = 1, now = Date.now()) {
  const DAY = 86400000
  return stars
    .map((s) => {
      const heart = (s.warmth || 0) + (s.replies?.length || 0) * 1.5
      const ageDays = Math.max(0, (now - new Date(s.createdAt).getTime()) / DAY)
      return { star: s, score: heart / (1 + ageDays / 10) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.star)
}
