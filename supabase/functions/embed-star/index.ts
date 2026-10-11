/**
 * 잔별의 의미 읽기 — Gemini 임베딩
 * ---------------------------------------------------------------
 * 글 한 편을 Gemini(gemini-embedding-001)에 보내 '의미'를 768개의 숫자로 받아
 * star_embeddings 에 저장합니다. 이 숫자끼리 가까우면 마음이 닮은 글이에요.
 * (단어가 하나도 겹치지 않아도 — "씁쓸했다"와 "마음이 좀 그랬다"를 가깝게 봅니다)
 *
 * 부르는 법
 *   { star_id: "..." }  → 그 별 하나 (이미 있으면 건너뜀)
 *   {}                  → 아직 의미를 안 읽은 별을 최근 것부터 최대 40개 (처음 한 번 채울 때)
 *
 * 필요한 비밀값 (대시보드 → Edge Functions → Secrets)
 *   GEMINI_API_KEY         — Google AI Studio 에서 만든 잔별 키 (결제가 켜진 프로젝트)
 *   JANBYEOL_SERVICE_KEY   — delete-account 와 같은 관리자 키 (이미 넣어두셨다면 그대로)
 *
 * 배포
 *   supabase functions deploy embed-star
 *   또는 대시보드 → Edge Functions → Deploy a new function → Via Editor (이 파일 내용 붙여넣기)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'gemini-embedding-001'
const DIM = 768
const BACKFILL_MAX = 40

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** 관리자 키 — delete-account 와 같은 방식으로 찾습니다 */
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
        const v = first as Record<string, unknown>
        const found = v.api_key ?? v.key ?? v.secret
        if (typeof found === 'string') return found
      }
    } catch {
      /* 아래 수동 키로 */
    }
  }
  return Deno.env.get('JANBYEOL_SERVICE_KEY') ?? null
}

/** 글 → 의미(768개 숫자). 768로 줄인 값은 길이를 1로 맞춰야 한다고 Gemini 문서에 적혀 있어요 */
async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: text.slice(0, 4000) }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: DIM,
      }),
    }
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const values: number[] = data?.embedding?.values ?? data?.embeddings?.[0]?.values
  if (!Array.isArray(values) || values.length !== DIM) throw new Error('Gemini 응답 모양이 예상과 달라요')
  const norm = Math.hypot(...values) || 1
  return values.map((v) => v / norm)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!req.headers.get('Authorization')) return json({ error: '로그인이 필요합니다' }, 401)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const key = adminKey()
  if (!apiKey || !key) {
    console.error('[잔별] GEMINI_API_KEY 또는 관리자 키가 비어 있습니다 (Edge Functions → Secrets)')
    return json({ error: 'not configured' }, 500)
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  let body: { star_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* 빈 요청 = 채우기 */
  }

  // 의미를 읽을 별 고르기
  let targets: { id: string; text: string }[] = []
  let pendingTotal = 0
  if (body.star_id) {
    const { data: done } = await admin.from('star_embeddings').select('star_id').eq('star_id', body.star_id).maybeSingle()
    if (done) return json({ ok: true, skipped: 1 })
    const { data: star } = await admin.from('stars').select('id, text').eq('id', body.star_id).maybeSingle()
    if (!star) return json({ error: 'not found' }, 404)
    targets = [star]
  } else {
    const [{ data: stars }, { data: done }] = await Promise.all([
      admin.from('stars').select('id, text').order('created_at', { ascending: false }).limit(2000),
      admin.from('star_embeddings').select('star_id').limit(100000),
    ])
    const have = new Set((done || []).map((r: { star_id: string }) => r.star_id))
    const pending = (stars || []).filter((s: { id: string }) => !have.has(s.id))
    pendingTotal = pending.length
    targets = pending.slice(0, BACKFILL_MAX)
  }

  let saved = 0
  const errors: string[] = []
  for (const s of targets) {
    if (!s.text?.trim()) continue
    try {
      const vec = await embed(s.text, apiKey)
      const { error } = await admin
        .from('star_embeddings')
        .upsert({ star_id: s.id, embedding: JSON.stringify(vec), model: MODEL })
      if (error) throw error
      saved++
    } catch (err) {
      errors.push(String(err).slice(0, 200))
      if (errors.length >= 3) break // 키나 요금 문제면 더 부르지 않습니다
    }
  }
  if (errors.length) console.error('[잔별] 의미를 읽지 못한 별이 있어요', errors)
  return json({ ok: errors.length === 0, saved, remaining: body.star_id ? 0 : Math.max(0, pendingTotal - saved), errors })
})
