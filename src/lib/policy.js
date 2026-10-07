/**
 * 날짜로 켜지는 정책들 — 약관을 바꿀 때는 미리 알리고(제3조), 그날부터 동작을 바꿉니다.
 * 코드를 먼저 배포해 두어도 이 날짜 전까지는 예전처럼 움직여요.
 */

/** 공식 계정 소개 동의를 '처음 한 번만' 묻는 방식이 시작되는 때 (이용약관 제9조, 2026-10-14 변경) */
export const FEATURE_ONCE_FROM = Date.parse('2026-10-14T00:00:00+09:00')
export const isFeatureOnce = () => Date.now() >= FEATURE_ONCE_FROM

/** 약관 변경 안내를 화면에 띄우는 기간 — 적용 7일 전부터 적용 후 7일까지 */
export const TERMS_NOTICE = {
  id: 'terms-20261014',
  until: Date.parse('2026-10-21T00:00:00+09:00'),
}
