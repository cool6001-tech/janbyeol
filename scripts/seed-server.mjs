#!/usr/bin/env node
/**
 * 처음 한 번 — 서버의 하늘을 채웁니다
 * ---------------------------------------------------------------
 * 브라우저 저장일 때는 첫 방문자마다 예시를 심었습니다. 서버로 오면
 * 하늘이 모두의 것이 되므로, 예시는 **딱 한 번** 서버에 심습니다.
 * 그다음부터는 진짜 사람들의 별이 그 위에 쌓입니다.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-server.mjs
 *
 * 두 번 돌려도 안전합니다 — 이미 예시가 있으면 그냥 끝냅니다.
 * 나중에 지우고 싶으면:  delete from stars where seeded;
 */

import { createClient } from '@supabase/supabase-js'
import { buildSeed } from '../src/data/seed.js'
import { emotionOf } from '../src/lib/emotionColor.js'

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL 과 SUPABASE_SERVICE_KEY 가 필요합니다.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

/**
 * 예시를 쓴 사람들에게도 진짜 계정이 필요합니다.
 * (stars.author_id 가 profiles → auth.users 를 가리키니까요)
 * 로그인할 수 없는 계정이라 누가 들어올 일은 없습니다.
 */
async function ensureSeedAuthors(names) {
  const map = new Map()
  for (const [key, name] of names) {
    const email = `seed+${key}@janbyeol.internal`
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { seeded: true, name },
    })

    let id = created?.user?.id
    if (error) {
      if (!/already/i.test(error.message)) throw error
      // 이미 만들어 둔 계정 — 찾아서 씁니다
      const { data: list } = await db.auth.admin.listUsers({ perPage: 200 })
      id = list.users.find((u) => u.email === email)?.id
    }
    if (!id) throw new Error(`예시 작성자 계정을 만들지 못했습니다: ${name}`)

    await db.from('profiles').upsert({ id, name })
    map.set(key, { id, name })
  }
  return map
}

async function main() {
  const { count } = await db
    .from('stars')
    .select('id', { count: 'exact', head: true })
    .eq('seeded', true)

  if (count > 0) {
    console.log(`이미 예시 잔별 ${count}개가 하늘에 있습니다. 아무것도 하지 않습니다.`)
    return
  }

  // buildSeed 는 "나"의 별도 몇 개 만듭니다. 서버에서는 그 몫도
  // 예시 작성자 한 명에게 맡깁니다 — 아무의 것도 아닌 별은 둘 수 없으니까요.
  const host = { id: 'seed-host', name: '이름 없는 잔별' }
  const stars = buildSeed(host)

  const authorNames = new Map()
  for (const s of stars) authorNames.set(s.authorId, s.authorName)
  const authors = await ensureSeedAuthors([...authorNames.entries()])

  const rows = stars.map((s) => ({
    id: s.id,
    author_id: authors.get(s.authorId).id,
    author_name: s.authorName,
    text: s.text,
    tags: s.tags,
    emotion: emotionOf(s),
    photo_url: null,
    photo_seed: s.photoSeed,
    seeded: true,
    pos: s.pos,
    pos_v: s.posV,
    created_at: s.createdAt,
    warmth: s.warmth,
    seed_warmth: s.warmth, // 사람들이 온기를 더해도 이 값 위에 쌓입니다
    // 예시 별은 인스타에 올리지 않습니다 — 진짜 사람의 하루가 아니니까요
    allow_feature: false,
  }))

  const { error } = await db.from('stars').insert(rows)
  if (error) throw error

  // 예시에 달려 있던 답글도 함께
  const replies = []
  for (const s of stars) {
    for (const r of s.replies || []) {
      const author = [...authors.values()].find((a) => a.name === r.who)
      replies.push({
        star_id: s.id,
        author_id: (author ?? [...authors.values()][0]).id,
        text: r.text,
        created_at: r.createdAt,
      })
    }
  }
  if (replies.length) {
    const { error: rerr } = await db.from('replies').insert(replies)
    if (rerr) throw rerr
  }

  console.log(`하늘에 예시 잔별 ${rows.length}개와 별빛 ${replies.length}개를 심었습니다.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
