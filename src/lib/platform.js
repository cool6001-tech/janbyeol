/**
 * 지금 어디서 열렸는지 — 브라우저인가, 앱인가
 * ---------------------------------------------------------------
 * 앱(Capacitor)에서는 화면이 https://janbyeol.com 이 아니라
 * 폰 안의 파일(iOS: capacitor://localhost, 안드로이드: https://localhost)에서 열립니다.
 * 그래서 window.location.origin 을 그대로 쓰면 안 되는 곳이 생겨요.
 *   · 남에게 보내는 링크        → 항상 https://janbyeol.com
 *   · 소셜 로그인 후 돌아올 곳  → 앱 전용 주소 (com.janbyeol.app://auth)
 *
 * 이 파일은 다른 잔별 코드를 불러오지 않습니다 (supabase.js 가 이걸 불러가서요).
 */

import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'web' | 'ios' | 'android'
export const isIOSApp = isNative && platform === 'ios'

/** 바깥에 보여주는 진짜 주소 */
export const SITE = 'https://janbyeol.com'

/** capacitor.config.json 의 appId 와 같아야 합니다 */
export const APP_SCHEME = 'com.janbyeol.app'

/** 소셜 로그인을 마치고 앱으로 돌아오는 주소 — Supabase Redirect URLs 에 등록해야 합니다 */
export const AUTH_REDIRECT = `${APP_SCHEME}://auth`

/** 남에게 보낼 링크의 앞부분. 브라우저에선 지금 주소(미리보기 배포 포함), 앱에선 janbyeol.com */
export function siteOrigin() {
  return isNative ? SITE : window.location.origin
}
