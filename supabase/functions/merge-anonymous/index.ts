/**
 * 이 기기의 익명 성단을, 이미 지켜둔 내 성단으로 옮겨 담기
 * ---------------------------------------------------------------
 * 언제 쓰이나요?
 *   폰에서 이미 '카카오로 내 성단 지키기'를 한 사람이 PC에서 처음 잔별을 엽니다.
 *   PC에는 새 익명 계정이 생기고, 거기서 다시 카카오를 누르면 Supabase 는
 *   "이 카카오 계정은 이미 다른 사람(=폰의 나)에 붙어 있어요"라며 연결을 거절합니다.
 *   (identity_already_exists)
 *
 *   그러면 화면은 그 카카오 계정으로 **로그인**을 다시 하고, 로그인 전에 쓰던
 *   익명 계정의 토큰을 들고 여기로 옵니다. 여기서 익명 계정이 띄운 잔별·온기·
 *   별빛을 내 계정으로 옮기고, 빈 익명 계정은 지웁니다.
 *
 * 왜 안전한가요?
 *   - 옮겨 받는 쪽: Authorization 헤더의 토큰 = 지금 로그인한 본인
 *   - 옮겨 주는 쪽: body.fromToken = 그 브라우저가 들고 있던 익명 계정의 토큰
 *   두 토큰을 모두 서버가 직접 검증합니다. 남의 익명 계정 토큰을 손에 넣지 않는 한
 *   남의 별을 가져올 방법이 없고, 익명이 아닌 계정은 절대 옮기지 않습니다.
 *
 * 배포:
 *   supabase functions deploy merge-anonymous
 *   또는 대시보드 → Edge Functions → Deploy a new function → Via Editor
 *   (delete-account 와 같은 JANBYEOL_SERVICE_KEY 비밀값을 함께 씁니다)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/**
 * 관리자 키를 찾습니다.
 *
 * 예전 프로젝트는 SUPABASE_SERVICE_ROLE_KEY 가 그대로 들어옵니다.
 * 새 키 체계(sb_secret_…)로 만든 프로젝트는 SUPABASE_SECRET_KEYS 에
 * 묶음으로 들어올 수 있어서, 그쪽도 풀어봅니다.
 * 둘 다 없으면 JANBYEOL_SERVICE_KEY 라는 이름으로 직접 넣어둔 값을 씁니다.
 * (Supabase 는 SUPABASE_ 로 시작하는 이름으로는 비밀값을 못 만들게 합니다)
 */
function adminKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy

  const bundle = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle)
      const first = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object') {
        const v = (first as Record<string, unknown>)
        const found = v.api_key ?? v.key ?? v.secret
        if (typeof found === 'string') return found
      }
    } catch {
      /* 모양이 다르면 아래 수동 키로 넘어갑니다 */
    }
  }

  return Deno.env.get('JANBYEOL_SERVICE_KEY') ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: '로그인이 필요합니다' }, 401)

  const key = adminKey()
  if (!key) {
    console.error('[잔별] 관리자 키를 찾지 못했습니다. Edge Functions → Secrets 에 JANBYEOL_SERVICE_KEY 를 넣어주세요.')
    return json({ error: '지금은 옮길 수 없어요' }, 500)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let fromToken = ''
  try {
    fromToken = String((await req.json())?.fromToken || '')
  } catch {
    /* 아래에서 걸러집니다 */
  }
  if (!fromToken) return json({ error: '옮길 성단이 없습니다' }, 400)

  // 받는 쪽 — 지금 로그인한 본인, 익명이면 안 됩니다
  const { data: toData } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  const to = toData?.user
  if (!to || to.is_anonymous) return json({ error: '누구인지 확인할 수 없습니다' }, 401)

  // 주는 쪽 — 반드시 익명 계정이어야 합니다
  const { data: fromData } = await admin.auth.getUser(fromToken)
  const from = fromData?.user
  if (!from) return json({ error: '이전 성단을 확인할 수 없어요 (시간이 너무 지났을 수 있어요)' }, 400)
  if (!from.is_anonymous) return json({ error: '익명 성단만 옮길 수 있어요' }, 403)
  if (from.id === to.id) return json({ ok: true, moved: 0 })

  const { data: profile } = await admin.from('profiles').select('name').eq('id', to.id).maybeSingle()
  const myName = profile?.name || '나'

  /* ── 사진: <익명 id>/파일 → <내 id>/파일 ─────────────────── */
  const { data: files } = await admin.storage.from('star-photos').list(from.id, { limit: 1000 })
  for (const f of files || []) {
    const { error } = await admin.storage
      .from('star-photos')
      .move(`${from.id}/${f.name}`, `${to.id}/${f.name}`)
    if (error) console.error('[잔별] 사진을 옮기지 못했습니다', f.name, error.message)
  }

  /* ── 잔별 ─────────────────────────────────────────────────── */
  const { data: myStars } = await admin
    .from('stars')
    .select('id, photo_url')
    .eq('author_id', from.id)
  for (const s of myStars || []) {
    const photo = s.photo_url ? s.photo_url.replace(`/star-photos/${from.id}/`, `/star-photos/${to.id}/`) : null
    const { error } = await admin
      .from('stars')
      .update({ author_id: to.id, author_name: myName, photo_url: photo })
      .eq('id', s.id)
    if (error) console.error('[잔별] 별을 옮기지 못했습니다', s.id, error.message)
  }

  /* ── 온기: 두 계정이 같은 별에 준 온기는 하나로 ─────────────── */
  const { data: oldWarm } = await admin.from('warmths').select('star_id').eq('user_id', from.id)
  const { data: newWarm } = await admin.from('warmths').select('star_id').eq('user_id', to.id)
  const already = new Set((newWarm || []).map((w) => w.star_id))
  for (const w of oldWarm || []) {
    if (already.has(w.star_id)) {
      await admin.from('warmths').delete().eq('star_id', w.star_id).eq('user_id', from.id)
    } else {
      await admin.from('warmths').update({ user_id: to.id }).eq('star_id', w.star_id).eq('user_id', from.id)
    }
  }

  /* ── 별빛(답글) · 신고 · 차단 ─────────────────────────────── */
  await admin.from('replies').update({ author_id: to.id }).eq('author_id', from.id)
  await admin.from('reports').update({ reporter_id: to.id }).eq('reporter_id', from.id)

  const { data: oldBlocks } = await admin.from('blocks').select('blocked_id').eq('blocker_id', from.id)
  for (const b of oldBlocks || []) {
    if (b.blocked_id !== to.id) {
      await admin
        .from('blocks')
        .upsert({ blocker_id: to.id, blocked_id: b.blocked_id }, { onConflict: 'blocker_id,blocked_id' })
    }
  }

  /* ── 빈 익명 계정 정리 (남은 행은 cascade 로 함께 사라집니다) ── */
  const { error: delErr } = await admin.auth.admin.deleteUser(from.id)
  if (delErr) console.error('[잔별] 익명 계정을 지우지 못했습니다', delErr.message)

  return json({ ok: true, moved: (myStars || []).length })
})
