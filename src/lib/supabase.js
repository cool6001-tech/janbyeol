/**
 * Supabase 연결 한 곳
 * ---------------------------------------------------------------
 * 여기 쓰이는 두 값은 **공개되어도 되는 값**입니다.
 * anon 키는 브라우저에 나가도 괜찮게 설계된 키이고, 진짜 방어선은
 * supabase/schema.sql 의 RLS 정책입니다.
 *
 * 절대 여기에 두면 안 되는 것: service_role 키.
 * 그건 GitHub Actions 쪽(scripts/daily-instagram.mjs)에서만 씁니다.
 *
 * .env.local 에 넣어주세요 (이 파일은 git에 올리지 않습니다):
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * 값이 비어 있으면 createClient 가 그 자리에서 예외를 던집니다.
 * 그러면 화면이 **하얗게** 뜨고, 콘솔을 열어보기 전까지는 이유를 알 수 없어요.
 * (Vercel에 환경변수 하나를 빠뜨렸을 때 실제로 이렇게 됩니다.)
 *
 * 그래서 닿지 않는 주소를 대신 넣어 앱은 살려 둡니다. 네트워크 호출은
 * 전부 실패하지만, 그 실패는 useJanbyeol 이 받아서
 * "지금은 하늘에 닿지 못했어요" 로 보여줍니다. 흰 화면보다는 낫습니다.
 */
export const isConfigured = Boolean(url && anonKey)

if (!isConfigured) {
  console.error(
    '[잔별] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다.\n' +
      '  · 로컬이라면 .env.local 을 만들고 개발 서버를 다시 띄우세요 (Vite는 재시작 때만 읽습니다).\n' +
      '  · 배포라면 Vercel → Settings → Environment Variables 를 확인하고 다시 배포하세요.'
  )
}

export const sb = createClient(url || 'https://unset.invalid', anonKey || 'unset', {
  auth: {
    persistSession: true, // 익명 계정도 이 세션이 남아야 "내 별"이 유지됩니다
    autoRefreshToken: true,
    detectSessionInUrl: true, // 소셜 로그인 후 돌아올 때 필요
  },
})

/** 사진을 올려두는 곳 — 공개 버킷입니다 */
export const PHOTO_BUCKET = 'star-photos'
