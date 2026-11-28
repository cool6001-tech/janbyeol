/**
 * 손님별(콜라보 혜성) 숫자 세기
 * ---------------------------------------------------------------
 *   shown  새 혜성 알림을 봤다 (기기마다 한 번만 뜨는 알림)
 *   open   혜성을 눌러 소개 창을 열었다
 *   go     소개 창에서 상대 서비스로 건너갔다 — 잔별이 보내준 유입
 *
 * 보내는 건 **손님 id 와 동작 이름**뿐입니다. 누가 눌렀는지는 서버에 남지 않고
 * 날짜별 합계로만 쌓여요 (supabase/visitors.sql). 관리자 리포트에서 봅니다.
 */
import { sb } from './supabase.js'

export function countVisitorEvent(visitorId, event) {
  try {
    sb.rpc('count_visitor_event', { p_visitor: visitorId, p_event: event }).then(
      () => {},
      () => {} // 통계가 실패해도 이용에는 아무 영향이 없어야 합니다
    )
  } catch {
    /* 무시 */
  }
}
