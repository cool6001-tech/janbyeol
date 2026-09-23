#!/usr/bin/env node
/**
 * 오늘 가장 온기를 많이 받은 잔별 → 인스타그램 자동 게시
 * ---------------------------------------------------------------
 * 하루 한 번 GitHub Actions가 이 파일을 실행합니다.
 *
 *   1. 어제 하루 동안 온기를 가장 많이 받은 잔별 하나를 고른다
 *   2. 그 글로 1080x1350 카드 이미지를 그린다
 *   3. 이미지를 공개 URL에 올린다 (인스타는 URL로만 받습니다)
 *   4. 인스타그램 그래프 API로 컨테이너를 만들고 → 게시한다
 *   5. 게시한 별에 표시를 남겨 같은 별이 두 번 올라가지 않게 한다
 *
 * ⚠️ 먼저 읽어주세요
 *   · 이 스크립트는 서버 DB(Supabase)를 전제로 합니다.
 *     지금 잔별은 데이터가 각자 브라우저에만 있어서 "가장 온기 많은 글"이
 *     서버에 존재하지 않습니다. supabase/schema.sql 을 먼저 올리세요.
 *   · 남의 글을 올리는 일입니다. 이용약관에 "공개된 잔별은 잔별 공식 계정에
 *     소개될 수 있습니다" 조항을 넣고, 글쓴이가 끌 수 있는 스위치
 *     (stars.allow_feature)를 두세요. 아래 쿼리가 그 값을 확인합니다.
 *
 * 필요한 환경변수 (GitHub → Settings → Secrets and variables → Actions)
 *   SUPABASE_URL           https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY   service_role 키 (절대 프런트엔드에 두지 마세요)
 *   IG_USER_ID             인스타 프로페셔널 계정의 IG User ID
 *   IG_ACCESS_TOKEN        장기 토큰 (60일마다 갱신 — 아래 참고)
 *   PUBLIC_BASE_URL        https://janbyeol.com  (카드 링크용)
 *   DRY_RUN=1              게시 없이 카드만 만들어 보고 싶을 때
 */

import { drawCard, registerFonts } from './lib/card.mjs'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  IG_USER_ID,
  IG_ACCESS_TOKEN,
  PUBLIC_BASE_URL = 'https://janbyeol.com',
  DRY_RUN,
} = process.env

const GRAPH = 'https://graph.facebook.com/v21.0'

/* ───────────────────────────────────────────────────────────
   1. 오늘의 잔별 고르기
─────────────────────────────────────────────────────────── */
async function pickStarOfTheDay(db) {
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('stars')
    .select('id, text, tags, warmth, emotion, created_at, author_name')
    .eq('allow_feature', true) // 글쓴이가 소개를 허락한 별만
    .eq('is_hidden', false) // 신고로 가려진 별 제외
    .is('featured_at', null) // 아직 올라간 적 없는 별만
    .gte('created_at', since)
    .order('warmth', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const star = data?.[0]

  // 하루 동안 올릴 만한 별이 없으면 조용히 건너뜁니다.
  // (억지로 옛날 별을 끌어오면 계정이 금방 지루해집니다)
  if (!star) return null
  if ((star.warmth ?? 0) < 3) {
    console.log(`온기 ${star.warmth}로는 아직 이릅니다. 오늘은 쉽니다.`)
    return null
  }
  return star
}

/* ───────────────────────────────────────────────────────────
   2. 카드 그리기는 scripts/lib/card.mjs 에 있습니다
      (개별 잔별 공유 썸네일과 같은 그림을 씁니다)

   3. 공개 URL에 올리기 (인스타는 파일 업로드를 받지 않습니다)
─────────────────────────────────────────────────────────── */
async function uploadCard(db, buffer, starId) {
  const name = `ig/${new Date().toISOString().slice(0, 10)}-${starId}.jpg`
  const { error } = await db.storage
    .from('public-cards')
    .upload(name, buffer, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  const { data } = db.storage.from('public-cards').getPublicUrl(name)
  return data.publicUrl
}

/* ───────────────────────────────────────────────────────────
   4. 인스타그램 게시 — 컨테이너 만들고 → 올리기
─────────────────────────────────────────────────────────── */
function buildCaption(star) {
  const tags = (star.tags ?? []).slice(0, 3).map((t) => `#${t}`).join(' ')
  return [
    '오늘 가장 많은 온기를 받은 잔별입니다.',
    '',
    `“${(star.text || '').trim().slice(0, 120)}”`,
    '',
    '별거 아닌 줄 알았던 당신의 오늘이,',
    '이곳에선 누군가의 밤을 비추는 잔별이 됩니다.',
    '',
    `${PUBLIC_BASE_URL}`,
    '',
    `#잔별 #오늘의잔별 #감정기록 #하루기록 ${tags}`,
  ].join('\n')
}

async function postToInstagram(imageUrl, caption) {
  // (1) 컨테이너
  const createRes = await fetch(`${GRAPH}/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: IG_ACCESS_TOKEN }),
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error(`컨테이너 실패: ${JSON.stringify(created)}`)

  // (2) 준비될 때까지 기다리기 — 큰 이미지는 몇 초 걸립니다
  for (let i = 0; i < 12; i++) {
    const st = await fetch(
      `${GRAPH}/${created.id}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
    ).then((r) => r.json())
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR') throw new Error(`컨테이너 오류: ${JSON.stringify(st)}`)
    await new Promise((r) => setTimeout(r, 5000))
  }

  // (3) 게시
  const pubRes = await fetch(`${GRAPH}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: IG_ACCESS_TOKEN }),
  })
  const published = await pubRes.json()
  if (!pubRes.ok) throw new Error(`게시 실패: ${JSON.stringify(published)}`)
  return published.id
}

/* ───────────────────────────────────────────────────────────
   실행
─────────────────────────────────────────────────────────── */
async function main() {
  registerFonts()
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const star = await pickStarOfTheDay(db)
  if (!star) {
    console.log('오늘 올릴 잔별이 없습니다.')
    return
  }
  console.log(`오늘의 잔별: ${star.id} (온기 ${star.warmth})`)

  const jpeg = await drawCard(star)

  if (DRY_RUN) {
    await fs.mkdir('out', { recursive: true })
    await fs.writeFile('out/card.jpg', jpeg)
    console.log('DRY_RUN — out/card.jpg 만 만들었습니다.')
    return
  }

  const imageUrl = await uploadCard(db, jpeg, star.id)
  const mediaId = await postToInstagram(imageUrl, buildCaption(star))
  console.log('게시 완료:', mediaId)

  await db
    .from('stars')
    .update({ featured_at: new Date().toISOString(), featured_media_id: mediaId })
    .eq('id', star.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
