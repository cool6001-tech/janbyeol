/**
 * 계정 지우기
 * ---------------------------------------------------------------
 * 애플 5.1.1(v): 앱에서 계정을 만들 수 있으면 앱에서 지울 수도 있어야 합니다.
 * 브라우저에는 auth 사용자를 지울 권한이 없으므로(있으면 큰일입니다)
 * 여기서 service_role 로 대신 지웁니다.
 *
 * 부르는 쪽은 로그인된 사용자 본인뿐이고, 지우는 대상도 그 사람 자신입니다.
 * 토큰에서 id를 꺼내 쓰기 때문에 남의 계정을 지우도록 시킬 방법이 없습니다.
 *
 * 배포:
 *   supabase functions deploy delete-account
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) {
    return new Response(JSON.stringify({ error: '로그인이 필요합니다' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // 이 클라이언트는 부른 사람의 토큰으로 동작합니다 — 본인 확인용
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } }
  )

  const {
    data: { user },
  } = await asUser.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: '누구인지 확인할 수 없습니다' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // 여기서부터는 관리자 권한 — 지우는 대상은 위에서 확인한 본인뿐입니다
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 올린 사진도 함께 (stars 행은 cascade로 사라지지만 파일은 안 사라집니다)
  const { data: files } = await admin.storage.from('star-photos').list(user.id)
  if (files?.length) {
    await admin.storage.from('star-photos').remove(files.map((f) => `${user.id}/${f.name}`))
  }

  // profiles → stars → warmths/replies 까지 on delete cascade 로 따라 지워집니다
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
