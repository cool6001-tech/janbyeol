/**
 * 앱에서만 필요한 일들
 * ---------------------------------------------------------------
 * 브라우저에서는 이 파일의 함수들이 아무것도 하지 않거나 예전 방식 그대로 움직입니다.
 * 플러그인은 앱에서만 불러와서(import()) 웹 번들 무게에 더해지지 않게 했어요.
 *
 *   startOAuth        카카오·구글·애플 연결/로그인 (앱: 시스템 브라우저 → 딥링크로 복귀)
 *   initNative        앱이 켜질 때 한 번 — 딥링크 받기, 상태바, 바깥 링크 가로채기
 *   shareLink         링크 공유창
 *   shareFile         카드 이미지·영상 공유창
 *   haptic            가벼운 진동
 */

import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { sb } from './supabase.js'
import { isNative, AUTH_REDIRECT, SITE } from './platform.js'

/* ---------------------------------------------------------------
   소셜 로그인
   ---------------------------------------------------------------
   앱 안의 웹뷰에서 바로 구글 로그인을 열면 구글이 막습니다(disallowed_useragent).
   그래서 앱에서는 시스템 브라우저(iOS: SFSafariViewController, 안드로이드: Custom Tabs)로
   열고, 끝나면 com.janbyeol.app://auth?code=... 로 앱이 다시 열립니다.
   받은 code 를 세션으로 바꾸는 일은 initNative 의 appUrlOpen 이 합니다.
--------------------------------------------------------------- */
export async function startOAuth(kind, provider) {
  const options = isNative
    ? { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true }
    : { redirectTo: `${window.location.origin}/` }

  const call = kind === 'link' ? sb.auth.linkIdentity.bind(sb.auth) : sb.auth.signInWithOAuth.bind(sb.auth)
  const { data, error } = await call({ provider, options })
  if (error) throw error

  if (isNative && data?.url) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: data.url, presentationStyle: 'popover' })
  }
}

/** com.janbyeol.app://auth?code=… 또는 …#error=… 를 받아 처리합니다 */
async function handleAuthReturn(url) {
  const { Browser } = await import('@capacitor/browser')
  Browser.close().catch(() => {}) // 안드로이드는 close 가 없어서 실패하는 게 정상

  let u
  try {
    u = new URL(url)
  } catch {
    return
  }
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''))
  const pick = (k) => u.searchParams.get(k) || hash.get(k)

  const code = pick('code')
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[잔별] 로그인 코드를 세션으로 바꾸지 못했습니다.', error)
      window.location.replace('/?error=exchange_failed&error_description=' + encodeURIComponent(error.message || ''))
      return
    }
    // 처음부터 다시 켜서 storage.js 의 resolveUser 가 평소처럼 이어받게 합니다 (성단 옮겨 담기 포함)
    window.location.replace('/')
    return
  }

  // 오류(이미 다른 계정에 붙은 카카오 등)는 웹과 똑같이 주소에 실어 다시 켭니다.
  // storage.js 가 error_code 를 보고 원래 성단으로 들어가는 길을 엽니다.
  const params = new URLSearchParams()
  ;['error', 'error_code', 'error_description'].forEach((k) => {
    const v = pick(k)
    if (v) params.set(k, v)
  })
  if ([...params.keys()].length) window.location.replace('/?' + params.toString())
}

/* ---------------------------------------------------------------
   앱이 켜질 때 한 번
--------------------------------------------------------------- */
let started = false
export async function initNative() {
  if (!isNative || started) return
  started = true

  const { App } = await import('@capacitor/app')

  // 밤하늘 위에 밝은 글씨의 상태바
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {})

  // 소셜 로그인에서 돌아오기
  App.addListener('appUrlOpen', ({ url }) => {
    if (url && url.startsWith(AUTH_REDIRECT)) handleAuthReturn(url)
  })

  // 약관·방침·잔별 이야기·바깥 사이트 링크 → 앱 안에서 길을 잃지 않게 브라우저 시트로 엽니다
  document.addEventListener(
    'click',
    async (e) => {
      const a = e.target?.closest?.('a[href]')
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (/^(mailto|tel|sms):/i.test(href)) return // 메일 앱 등은 시스템이 알아서 엽니다

      let target = null
      if (/^https?:\/\//i.test(href)) target = href
      else if (/^\/(terms|privacy|story)(\.html)?(\/|$|\?|#)/.test(href)) target = SITE + href.replace(/\.html/, '')
      if (!target) return

      e.preventDefault()
      const { Browser } = await import('@capacitor/browser')
      Browser.open({ url: target, presentationStyle: 'popover' })
    },
    true
  )
}

/* ---------------------------------------------------------------
   공유
--------------------------------------------------------------- */

/** 링크 공유. 'shared' | 'copied' | 'cancelled' 를 돌려줍니다 */
export async function shareLink({ title, text, url }) {
  if (isNative) {
    const { Share } = await import('@capacitor/share')
    try {
      await Share.share({ title, text, url, dialogTitle: title })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}

/** 카드 파일(이미지·영상)을 앱의 공유창으로 보냅니다. 앱이 아니면 null (웹 방식을 그대로 쓰세요) */
export async function shareFile(blob, fileName) {
  if (!isNative) return null
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  const data = await blobToBase64(blob)
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache })
  try {
    await Share.share({ files: [uri] })
    return 'shared'
  } catch {
    return 'cancelled'
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/* ---------------------------------------------------------------
   진동 — 별이 떠오를 때 손끝에 한 번
--------------------------------------------------------------- */
export async function haptic(kind = 'light') {
  if (!isNative) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })
  } catch {
    /* 진동이 없는 기기 */
  }
}
