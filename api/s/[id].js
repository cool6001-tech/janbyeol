/**
 * 잔별 하나를 공유했을 때 — janbyeol.com/s/<별 id>
 * ---------------------------------------------------------------
 * 카카오톡·문자 스크래퍼는 자바스크립트를 실행하지 않습니다. 그래서
 * React가 아니라 **서버가** 그 별의 글이 담긴 미리보기 태그를 써서 보냅니다.
 *
 * 사람이 열면 곧바로 앱으로 보내면서 그 별을 띄워줍니다(/?star=<id>).
 * 스크래퍼는 기다리지 않고 태그만 읽고 갑니다.
 *
 * 필요한 환경변수 (Vercel → Settings → Environment Variables)
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (브라우저용과 같은 값)
 *   PUBLIC_BASE_URL                              https://janbyeol.com
 */

import { createClient } from '@supabase/supabase-js'

const BASE = process.env.PUBLIC_BASE_URL || 'https://janbyeol.com'

/** 남의 글을 HTML 안에 넣습니다 — 반드시 막아야 하는 자리 */
function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function page({ title, description, image, url, redirectTo }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="잔별" />
<meta property="og:locale" content="ko_KR" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:secure_url" content="${esc(image)}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1080" />
<meta property="og:image:height" content="1350" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<style>
  html,body{margin:0;height:100%;background:#04050a;color:#aeb8d2;
    font-family:'Noto Sans KR',system-ui,sans-serif;font-weight:300}
  main{height:100%;display:grid;place-items:center;text-align:center;padding:24px}
  a{color:#e2d6ff}
</style>
<script>location.replace(${JSON.stringify(redirectTo)})</script>
</head>
<body>
  <main>
    <p>잔별로 데려다드릴게요.<br /><a href="${esc(redirectTo)}">바로 열기</a></p>
  </main>
</body>
</html>`
}

export default async function handler(req, res) {
  const { id } = req.query

  const sb = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  const { data: star } = await sb
    .from('stars')
    .select('id, text, warmth, emotion, is_hidden')
    .eq('id', id)
    .maybeSingle()

  // 없는 별이거나 가려진 별이면 조용히 첫 화면으로 — 무엇이 있었는지 말하지 않습니다
  if (!star || star.is_hidden) {
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(
      page({
        title: '잔별 — 사소한 하루가 별이 되어 떠오르는 곳',
        description: '별거 아닌 줄 알았던 당신의 오늘이, 이곳에선 누군가의 밤을 비추는 잔별이 됩니다.',
        image: `${BASE}/og-image.png?v=1`,
        url: `${BASE}/`,
        redirectTo: `${BASE}/`,
      })
    )
  }

  const body = (star.text || '').trim()
  const short = body.length > 60 ? `${body.slice(0, 60)}…` : body

  // 미리보기 이미지는 한 번 만들어 두면 안 바뀝니다 — 오래 캐시해도 됩니다
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(
    page({
      title: `“${short}” — 잔별`,
      description:
        star.warmth > 0
          ? `${star.warmth}명의 밤을 비춘 잔별이에요. 당신의 오늘도 여기에 띄워보세요.`
          : '별거 아닌 줄 알았던 당신의 오늘이, 이곳에선 누군가의 밤을 비추는 잔별이 됩니다.',
      image: `${BASE}/api/card/${encodeURIComponent(star.id)}.jpg`,
      url: `${BASE}/s/${encodeURIComponent(star.id)}`,
      redirectTo: `${BASE}/?star=${encodeURIComponent(star.id)}`,
    })
  )
}
