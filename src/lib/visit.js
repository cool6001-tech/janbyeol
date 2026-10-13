/**
 * 머문 시간 — 트랙션 리포트의 재료
 * ---------------------------------------------------------------
 * 화면이 보이는 동안 30초마다 "아직 보고 있어요"를 한 번 보냅니다. 그게 전부예요.
 * 어느 잔별을 열었는지, 무엇을 읽었는지는 보내지 않습니다 (별길은 여전히 브라우저에만).
 * 서버는 이걸 합계로만 씁니다 — 평균 머문 시간, 하루 방문자 수 같은 것들.
 * 기록은 90일이 지나면 지워집니다 (supabase/metrics.sql).
 */
import { sb } from './supabase.js'
import { ensureUser } from './storage.js'

const BEAT_MS = 30 * 1000
const NEW_SESSION_AFTER_MS = 30 * 60 * 1000 // 30분 넘게 다른 곳에 있다 오면 새 접속으로

function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
}

let started = false

/* 개인정보처리방침에 이 기록을 적은 날(10/13 게시)부터 7일 뒤에 시작합니다 — 미리 알리고 모으기 */
const CLOCK_STARTS_AT = Date.parse('2026-10-20T00:00:00+09:00')

export function startVisitClock() {
  if (started || typeof document === 'undefined') return
  if (Date.now() < CLOCK_STARTS_AT) return
  started = true

  let id = newId()
  let hiddenAt = null
  let ready = false

  const send = () => {
    if (!ready) return
    sb.rpc('touch_session', { p_id: id }).then(
      () => {},
      () => {} // 통계가 실패해도 이용에는 아무 영향이 없어야 합니다
    )
  }

  ensureUser().then((u) => {
    if (!u?.id) return
    ready = true
    if (document.visibilityState === 'visible') send()
  })

  setInterval(() => {
    if (document.visibilityState === 'visible') send()
  }, BEAT_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      send() // 떠나는 순간까지를 머문 시간으로
      hiddenAt = Date.now()
    } else {
      if (hiddenAt && Date.now() - hiddenAt > NEW_SESSION_AFTER_MS) id = newId()
      hiddenAt = null
      send()
    }
  })
}

/** 공유 링크(/s/…)를 거쳐 들어왔으면 한 번 셉니다 — 누가 왔는지는 남기지 않고 날짜별 숫자만 */
export function countShareArrival() {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('from') !== 'share') return
    url.searchParams.delete('from')
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash)
    sb.rpc('count_share_visit').then(
      () => {},
      () => {}
    )
  } catch {
    /* 무시 */
  }
}
