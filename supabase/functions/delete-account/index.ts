/**
 * 계정 지우기
 * ---------------------------------------------------------------
 * 애플 5.1.1(v): 앱에서 계정을 만들 수 있으면 앱에서 지울 수도 있어야 합니다.
 * 개인정보처리방침에도 "요청하면 지웁니다"라고 적어뒀으니, 그 약속을 지키는 코드입니다.
 *
 * 브라우저에는 auth 사용자를 지울 권한이 없습니다(있으면 큰일입니다).
 * 그래서 여기서 관리자 권한으로 대신 지웁니다. 다만 **지우는 대상은
 * 토큰에서 꺼낸 본인뿐**이라, 남의 계정을 지워달라고 시킬 방법이 없습니다.
 *
 * 지워지는 것:
 *   auth.users → profiles → stars → warmths · replies · reports · blocks
 *   (schema.sql 의 on delete cascade 가 줄줄이 따라옵니다)
 *   올린 사진은 cascade 가 닿지 않으므로 여기서 직접 지웁니다.
 *
 * 배포:
 *   supabase functions deploy delete-account
 *   또는 대시보드 → Edge Functions → Deploy a new function → Via Editor
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
    // 설정이 빠진 것은 이용자 잘못이 아니니, 원인을 분명히 남깁니다
    console.error(
      '[잔별] 관리자 키를 찾지 못했습니다. ' +
        'Edge Functions → Secrets 에 JANBYEOL_SERVICE_KEY 를 넣어주세요.'
    )
    return json({ error: '지금은 계정을 지울 수 없어요. 잠시 뒤에 다시 시도해 주세요.' }, 500)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 토큰을 관리자 클라이언트로 직접 검증합니다 — anon 키가 따로 필요 없습니다
  const token = auth.replace(/^Bearer\s+/i, '')
  const { data, error: whoErr } = await admin.auth.getUser(token)
  const user = data?.user
  if (whoErr || !user) return json({ error: '누구인지 확인할 수 없습니다' }, 401)

  // 올린 사진 — stars 행은 cascade 로 사라지지만 파일은 따라 사라지지 않습니다
  const { data: files } = await admin.storage
    .from('star-photos')
    .list(user.id, { limit: 1000 })
  if (files?.length) {
    const { error: rmErr } = await admin.storage
      .from('star-photos')
      .remove(files.map((f) => `${user.id}/${f.name}`))
    // 사진을 못 지웠다고 계정 삭제를 멈추지는 않습니다. 기록만 남깁니다.
    if (rmErr) console.error('[잔별] 사진을 지우지 못했습니다', rmErr.message)
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[잔별] 계정을 지우지 못했습니다', error.message)
    return json({ error: '계정을 지우지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, 500)
  }

  return json({ ok: true })
})
