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

/**
 * 어느 길로 들어왔나 — ?from=card 같은 표시를 한 번 세고 주소에서 지웁니다.
 *
 * 홍보를 여러 곳에 동시에 열면 어디서 사람이 왔는지 모르고, 모르면 다음에 뭘
 * 더 할지도 모릅니다. 그래서 길마다 따로 셉니다.
 *
 * 세는 건 **날짜와 길 이름과 숫자**뿐입니다. 누가 왔는지는 남기지 않아요.
 * 주소에서 표시를 지우는 건 깔끔해서가 아니라, 그 사람이 이 주소를 다시
 * 열거나 누구에게 보냈을 때 같은 사람이 또 세어지면 안 되기 때문입니다.
 *
 * 서버도 같은 목록을 들고 있습니다(count_entry). 새 경로를 만들면 양쪽에 넣으세요.
 */
const KNOWN_ENTRIES = ['card', 'share', 'story', 'qr', 'bio', 'poster']

export function countEntry() {
  try {
    const url = new URL(window.location.href)
    const from = (url.searchParams.get('from') || '').toLowerCase()
    if (!from) return
    url.searchParams.delete('from')
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash)
    if (!KNOWN_ENTRIES.includes(from)) return
    sb.rpc('count_entry', { p_source: from }).then(
      () => {},
      () => {} // 통계가 실패해도 이용에는 아무 영향이 없어야 합니다
    )
  } catch {
    /* 무시 */
  }
}

/** 예전 이름 — App.jsx 가 아직 이걸 부르고 있어도 깨지지 않게 */
export const countShareArrival = countEntry
