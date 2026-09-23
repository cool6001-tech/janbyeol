/**
 * 계정 — 익명으로 시작해서, 원할 때 이어 붙이기
 * ---------------------------------------------------------------
 * 잔별에는 로그인 화면이 없습니다. 처음 온 사람은 아무것도 누르지 않고
 * 바로 별을 띄웁니다. 다만 그 계정은 이 브라우저에만 묶여 있어서,
 * 폰을 바꾸거나 브라우저를 지우면 성단을 잃습니다.
 *
 * 그래서 '내 성단 지키기' 하나만 둡니다. 누르면 지금 쓰던 **그 익명 계정에**
 * 카카오/구글을 덧붙입니다. 새 계정을 만드는 게 아니라서 띄운 별을
 * 하나도 안 잃습니다. 이게 linkIdentity 와 signInWithOAuth 의 차이입니다.
 *
 * ⚠️ Supabase 대시보드에서 먼저 켜야 하는 것 두 가지
 *    Authentication → Sign In / Up → Allow anonymous sign-ins      (켜기)
 *    Authentication → Providers  → Manual Linking                  (켜기)
 */

import { sb } from './supabase.js'
import { currentUser, ensureUser } from './storage.js'

/**
 * 지금 익명 계정에 소셜 계정을 덧붙입니다.
 * 브라우저가 해당 제공자로 떠났다가 돌아옵니다.
 */
export async function keepMyConstellation(provider = 'kakao') {
  await ensureUser()
  const { error } = await sb.auth.linkIdentity({
    provider,
    options: { redirectTo: `${window.location.origin}/` },
  })
  if (error) throw error
}

/** 이미 연결했는지 — 버튼을 보여줄지 정하는 값 */
export function isAnonymous() {
  return currentUser().isAnonymous !== false
}

/** 이름 바꾸기 — '나' 말고 다른 이름으로 불리고 싶을 때 */
export async function rename(name) {
  const me = await ensureUser()
  const clean = name.trim().slice(0, 20) || '나'
  const { error } = await sb.from('profiles').update({ name: clean }).eq('id', me.id)
  if (error) throw error
  // 이미 띄운 별들의 표시 이름도 함께 (내 별만 — RLS가 막아줍니다)
  await sb.from('stars').update({ author_name: clean }).eq('author_id', me.id)
  return clean
}

export async function signOut() {
  await sb.auth.signOut()
}

/**
 * 계정 지우기 — 애플 5.1.1(v) 가 요구하는 기능입니다.
 * "계정을 만들 수 있으면 앱 안에서 지울 수도 있어야 한다."
 *
 * 브라우저에서는 auth 사용자를 지울 권한이 없어서(그게 정상입니다)
 * Edge Function 에 부탁합니다 — supabase/functions/delete-account/
 * 별·온기·답글은 외래키 on delete cascade 로 같이 사라집니다.
 */
export async function deleteAccount() {
  await ensureUser()
  const { error } = await sb.functions.invoke('delete-account')
  if (error) throw error
  await sb.auth.signOut()
  try {
    window.localStorage.clear() // 별길과 첫 안내 기록까지
  } catch {
    /* 무시 */
  }
}
