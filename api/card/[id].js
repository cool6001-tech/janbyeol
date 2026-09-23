/**
 * 공유 미리보기 그림 — janbyeol.com/api/card/<별 id>.jpg
 * ---------------------------------------------------------------
 * 인스타에 올라가는 카드와 **같은 그림**입니다 (scripts/lib/card.mjs).
 * 한 번 만든 그림은 Supabase Storage 에 넣어두고 다음부터는 그리지 않습니다.
 * 카카오톡이 썸네일을 오래 캐시하므로 어차피 두 번 부를 일도 드뭅니다.
 *
 * ⚠️ 폰트가 저장소에 함께 올라가야 합니다. vercel.json 의 includeFiles 가
 *    assets/fonts 를 이 함수에 넣어줍니다. 빠지면 글자가 □□□ 로 나옵니다.
 *
 * 여기서만 service_role 키를 씁니다 — 만든 그림을 보관함에 써야 하기 때문입니다.
 * 이 파일은 서버에서만 도니까 괜찮습니다. 절대 src/ 로 옮기지 마세요.
 */

import { createClient } from '@supabase/supabase-js'
import { drawCard, registerFonts } from '../../scripts/lib/card.mjs'

let fontsReady = false

export default async function handler(req, res) {
  // /api/card/s-abc123.jpg → s-abc123
  const id = String(req.query.id || '').replace(/\.jpe?g$/i, '')

  const sb = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )
  const cachePath = `share/${id}.jpg`

  // 이미 만들어 둔 그림이 있으면 그리로 보냅니다
  const { data: cached } = await sb.storage.from('public-cards').list('share', {
    search: `${id}.jpg`,
    limit: 1,
  })
  if (cached?.length) {
    const url = sb.storage.from('public-cards').getPublicUrl(cachePath).data.publicUrl
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.redirect(302, url)
  }

  const { data: star } = await sb
    .from('stars')
    .select('id, text, warmth, emotion, is_hidden')
    .eq('id', id)
    .maybeSingle()

  if (!star || star.is_hidden) {
    // 없는 별이면 기본 썸네일로 — 미리보기가 깨지는 것보다 낫습니다
    return res.redirect(302, `${process.env.PUBLIC_BASE_URL || ''}/og-image.png?v=1`)
  }

  if (!fontsReady) {
    registerFonts()
    fontsReady = true
  }

  const jpeg = await drawCard(star)

  // 다음 사람을 위해 저장해 둡니다 (실패해도 이번 응답은 그대로 나갑니다)
  try {
    await sb.storage
      .from('public-cards')
      .upload(cachePath, jpeg, { contentType: 'image/jpeg', upsert: true })
  } catch {
    /* 무시 */
  }

  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.status(200).send(jpeg)
}
