/**
 * 잔별의 의미 읽기 — Gemini 임베딩
 * ---------------------------------------------------------------
 * 글 한 편을 Gemini(gemini-embedding-001)에 보내 '의미'를 768개의 숫자로 받아
 * star_embeddings 에 저장합니다. 이 숫자끼리 가까우면 마음이 닮은 글이에요.
 * (단어가 하나도 겹치지 않아도 — "씁쓸했다"와 "마음이 좀 그랬다"를 가깝게 봅니다)
 *
 * 2026-11부터 여기서 두 가지를 더 합니다.
 *   · **감정**  — 의미가 어느 기준 문장에 가장 가까운지로 정합니다.
 *                 한국어 정규식 사전이 하던 일을 대신해요. 그래서 영어로 쓰든
 *                 일본어로 쓰든 같은 마음이면 같은 색 별이 됩니다.
 *   · **언어**  — 글자 모양으로 봅니다 (한글/가나/한자/키릴/그 외).
 *                 번역 버튼을 보여줄지 말지를 정하는 데만 씁니다.
 *
 * 부르는 법
 *   { star_id: "..." }  → 그 별 하나 (이미 있으면 건너뜀)
 *   {}                  → 아직 의미를 안 읽은 별을 최근 것부터 최대 40개
 *   { redo: true }      → 이미 읽은 별도 감정만 다시 매깁니다 (임베딩은 그대로 씀)
 *
 * 필요한 비밀값 (대시보드 → Edge Functions → Secrets)
 *   GEMINI_API_KEY         — Google AI Studio 에서 만든 잔별 키 (결제가 켜진 프로젝트)
 *   JANBYEOL_SERVICE_KEY   — delete-account 와 같은 관리자 키
 *
 * 먼저 실행해 두셔야 하는 것: supabase/semantic-match.sql, supabase/multilingual.sql
 *
 * 배포
 *   supabase functions deploy embed-star
 *   또는 대시보드 → Edge Functions → embed-star → Code 에 붙여넣고 Deploy updates
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// 마음과 상황의 기준 문장 — 이 서비스의 자(尺)입니다
import { allAnchors } from './anchors.ts'

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

/**
 * 이 프로젝트의 관리자 키들.
 *
 * 처음엔 **하나만** 집었습니다. 그게 잘못이었어요. 프로젝트에는 secret 키가
 * 여럿 있을 수 있고(키를 갈아끼우는 동안엔 반드시 그렇습니다), 저는 맨 앞의
 * 하나만 보고 "이것만 관리자 키"라고 못 박았습니다. 그래서 다른 쪽 키를
 * 들고 오면 주인인데도 문전박대를 당했습니다.
 *
 * 이제 **찾을 수 있는 모든 키를 모아** 그중 하나와 맞으면 주인으로 봅니다.
 * 전부 이 프로젝트의 관리자 키이니 어느 쪽이든 권한은 같아요.
 */
function adminKeys(): { keys: string[]; primary: string | null; sources: string[] } {
  const keys: string[] = []
  const sources: string[] = []
  const add = (v: unknown, from: string) => {
    if (typeof v === 'string' && v && !keys.includes(v)) {
      keys.push(v)
      sources.push(from)
    }
  }

  add(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'SERVICE_ROLE_KEY')

  const bundle = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle)
      const items = Array.isArray(parsed) ? parsed : Object.values(parsed)
      for (const it of items) {
        if (typeof it === 'string') add(it, 'SECRET_KEYS')
        else if (it && typeof it === 'object') {
          const v = it as Record<string, unknown>
          add(v.api_key ?? v.key ?? v.secret, 'SECRET_KEYS')
        }
      }
    } catch {
      /* 모양이 다르면 그냥 건너뜁니다 */
    }
  }

  add(Deno.env.get('JANBYEOL_SERVICE_KEY'), 'JANBYEOL_SERVICE_KEY')
  return { keys, primary: keys[0] ?? null, sources }
}

/**
 * 키의 지문 — 값은 숨기고 같은지 다른지만 보여줍니다.
 *
 * 키가 안 맞을 때 "안 맞는다"는 말만 돌려주면 고칠 길이 없습니다. 그렇다고
 * 키를 보여줄 수는 없고요. 그래서 **되돌릴 수 없는 지문** 여덟 글자만 보냅니다.
 */
async function fingerprint(v: string | null): Promise<string> {
  if (!v) return '(없음)'
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}·${v.length}자`
}

/**
 * 무슨 글자로 쓰였는가.
 *
 * 번역기를 부르지 않고 글자 모양만 셉니다. 공짜이고 빠르고, 우리가 필요한
 * 정확도(번역 버튼을 띄울까 말까)에는 충분합니다.
 * 한글이 섞여 있으면 한국어, 가나가 있으면 일본어 — 섞어 쓰는 글을 위해
 * 비율이 아니라 **있는지 없는지**로 봅니다.
 */
function langOf(text: string): string {
  if (/[가-힣ᄀ-ᇿ]/.test(text)) return 'ko'
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja'
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'
  if (/[฀-๿]/.test(text)) return 'th'
  if (/[؀-ۿ]/.test(text)) return 'ar'
  return 'en'
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

/**
 * 기준 문장 채우기 — **끊어서** 채웁니다.
 *
 * 문장이 120개입니다. 한 번에 다 부르면 Gemini 왕복만 120번이라 함수가
 * 시간 안에 못 끝내고 끊겨요. 그러면 반쯤 채워진 채로 남는데, 그 상태가
 * 가장 나쁩니다 — 반쪽짜리 자로 잰 마음은 틀린 마음이니까요.
 *
 * 그래서 **아직 없는 것만, 한 번에 budget 개씩** 채우고 몇 개 남았는지
 * 돌려줍니다. 0이 될 때까지 몇 번 더 부르면 됩니다.
 * 다 차면 언어의 그림자(lang_centroids)를 다시 계산합니다.
 */
async function fillAnchors(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  budget = 30
): Promise<{ filled: number; remaining: number; centroids?: number }> {
  const want = allAnchors()
  const { data: have } = await admin.from('meaning_anchors').select('kind, label, lang')
  const seen = new Set((have ?? []).map((r: Record<string, string>) => `${r.kind}|${r.label}|${r.lang}`))
  const todo = want.filter((a) => !seen.has(`${a.kind}|${a.label}|${a.lang}`))

  let filled = 0
  for (const a of todo.slice(0, budget)) {
    try {
      const vec = await embed(a.phrase, apiKey)
      const { error } = await admin.from('meaning_anchors').upsert({
        kind: a.kind,
        label: a.label,
        family: a.family,
        lang: a.lang,
        phrase: a.phrase,
        embedding: JSON.stringify(vec),
      })
      if (error) throw new Error(error.message)
      filled++
    } catch (err) {
      console.error('[잔별] 기준 문장을 못 담았어요', a.label, a.lang, String(err).slice(0, 200))
      break // 한 번 막히면 (대개 할당량) 남은 것도 막힙니다. 다음 호출에서 이어가요.
    }
  }

  const remaining = todo.length - filled
  if (remaining > 0) return { filled, remaining }

  // 다 찼습니다 — 언어마다의 평균 방향을 다시 구합니다
  const { data: n } = await admin.rpc('rebuild_lang_centroids')
  return { filled, remaining: 0, centroids: (n as number) ?? 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: '로그인이 필요합니다' }, 401)
  const token = auth.replace(/^Bearer\s+/i, '').trim()

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const { keys, primary: key, sources } = adminKeys()
  if (!apiKey || !key) {
    console.error('[잔별] GEMINI_API_KEY 또는 관리자 키가 비어 있습니다 (Edge Functions → Secrets)')
    return json({ error: 'not configured' }, 500)
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  let body: { star_id?: string; redo?: boolean; anchors?: boolean; budget?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* 빈 요청 = 채우기 */
  }

  /**
   * 누가 부르는가.
   *
   * 예전엔 Authorization 헤더가 **있기만 하면** 통과시켰습니다. 그건 자물쇠가
   * 아니라 문고리였어요 — 주소만 알면 아무 글자나 적어 넣고 Gemini 를 대신
   * 불러 쓸 수 있었습니다. 그 비용은 전부 저희 몫이고요.
   *
   * 이제 두 종류만 들어옵니다.
   *   · 별 하나 읽기(star_id) — 로그인한 사람이면 누구나. 익명 계정도 사람입니다.
   *     남의 별도 읽게 둡니다. 곁의 별을 찾으려면 그 별의 의미가 필요하고,
   *     한 별은 **평생 한 번만** 읽으니 부풀 일이 없습니다.
   *   · 통째로 다시 매기기(redo) / 빈 요청으로 밀어 넣기 — 관리자 키로만.
   *     하늘 전체를 훑는 일이라 사람 손에 쥐여줄 문이 아닙니다.
   */
  const isOwner = keys.includes(token) // 이 프로젝트의 관리자 키 중 **아무거나** 맞으면 주인입니다
  const wholeSky = Boolean(body.redo) || Boolean(body.anchors) || !body.star_id
  if (wholeSky) {
    if (!isOwner) {
      // 키가 안 맞을 때, 무엇과 안 맞는지를 알려줍니다 (값이 아니라 지문으로)
      return json({
        error: '관리자 키로만 할 수 있습니다',
        함수가_아는_키: await Promise.all(keys.map(fingerprint)),
        보내신_키: await fingerprint(token),
        어디서_가져왔나: sources,
      }, 403)
    }
  } else if (!isOwner) {
    const { data: who } = await admin.auth.getUser(token)
    if (!who?.user) return json({ error: '누구인지 확인할 수 없습니다' }, 401)
  }

  // ── 기준 문장 채우기 — 관리자가 직접 부릅니다 ──
  // 예전엔 모든 요청마다 "비었나?"를 물었습니다. 별 하나 읽을 때마다 쓸데없는
  // 왕복이 한 번씩 더 생기는 거예요. 채우는 건 처음 몇 번뿐인 일이니 따로 뺍니다.
  if (body.anchors) {
    try {
      const r = await fillAnchors(admin, apiKey, Math.min(60, Math.max(5, body.budget ?? 30)))
      return json({ ok: true, ...r })
    } catch (err) {
      console.error('[잔별] 기준 문장을 못 만들었습니다', String(err).slice(0, 300))
      return json({ error: '기준 문장을 채우지 못했어요' }, 502)
    }
  }

  /**
   * 이 글의 마음과 상황을 정해 별에 적어둡니다.
   *
   *   emotion  여덟 갈래 — 별의 색과 자리가 이걸 씁니다
   *   feeling  스물여섯 결 — 곁에 둘지 말지를 정할 때 씁니다
   *   topic    무엇에 대한 이야기인가
   *   lang     무슨 말로 썼나 (번역 버튼과 '언어의 그림자'에 씁니다)
   *
   * 언어를 먼저 정해서 넘깁니다. 서버가 그 언어의 평균 방향을 빼고 재야
   * '같은 한국어라서 가깝다'가 사라지니까요.
   */
  const label = async (starId: string, text: string, vecJson: string) => {
    const lang = langOf(text)

    /* 너무 짧은 글에서는 마음을 읽지 않습니다.
       `네 있었어요` 두 어절에 그리움을 붙이고 `배가고프다`에 기쁨을 붙이는 건
       읽은 게 아니라 찍은 겁니다. 짧은 글의 임베딩은 거의 소음이라, 자를
       들이대면 눈금은 늘 하나를 가리키지만 그 가리킴에 뜻이 없어요.
       글자(공백·기호 제외)로 세어 열두 자 미만이면 흰 별로 둡니다. */
    const letters = (text || '').replace(/[\s\p{P}\p{S}]/gu, '').length
    if (letters < 12) {
      await admin.from('stars').update({ emotion: null, feeling: null, topic: null, lang }).eq('id', starId)
      return { emotion: null, feeling: null, topic: null, lang }
    }

    const { data } = await admin.rpc('meaning_for', { p_embedding: vecJson, p_lang: lang })
    const m = (data ?? {}) as { feeling?: string | null; family?: string | null; topic?: string | null }
    await admin
      .from('stars')
      .update({
        emotion: m.family ?? null,
        feeling: m.feeling ?? null,
        topic: m.topic ?? null,
        lang,
      })
      .eq('id', starId)
    return { emotion: m.family ?? null, feeling: m.feeling ?? null, topic: m.topic ?? null, lang }
  }

  // ── 이미 의미를 읽은 별들의 감정만 다시 매기기 ──
  if (body.redo) {
    const { data: rows } = await admin
      .from('star_embeddings')
      .select('star_id, embedding, stars!inner(text)')
      .limit(BACKFILL_MAX * 5)

    let relabeled = 0
    for (const r of (rows || []) as { star_id: string; embedding: unknown; stars: { text: string } }[]) {
      try {
        const vecJson = typeof r.embedding === 'string' ? r.embedding : JSON.stringify(r.embedding)
        await label(r.star_id, r.stars?.text || '', vecJson)
        relabeled++
      } catch (err) {
        console.error('[잔별] 감정을 다시 매기지 못했어요', r.star_id, String(err).slice(0, 200))
      }
    }
    return json({ ok: true, relabeled })
  }

  // ── 의미를 아직 안 읽은 별 ──
  let targets: { id: string; text: string }[] = []
  let pendingTotal = 0
  if (body.star_id) {
    const { data: done } = await admin.from('star_embeddings').select('star_id').eq('star_id', body.star_id).maybeSingle()
    if (done) return json({ ok: true, skipped: 1 })
    const { data: star } = await admin.from('stars').select('id, text').eq('id', body.star_id).maybeSingle()
    if (!star) return json({ error: 'not found' }, 404)
    targets = [star as { id: string; text: string }]
  } else {
    const [{ data: stars }, { data: done }] = await Promise.all([
      admin.from('stars').select('id, text').order('created_at', { ascending: false }).limit(2000),
      admin.from('star_embeddings').select('star_id').limit(100000),
    ])
    const have = new Set((done || []).map((r: { star_id: string }) => r.star_id))
    const pending = ((stars || []) as { id: string; text: string }[]).filter((s) => !have.has(s.id))
    pendingTotal = pending.length
    targets = pending.slice(0, BACKFILL_MAX)
  }

  let saved = 0
  // 별 하나만 부탁받았을 때는 결과를 돌려줍니다 — 부른 화면이 바로 색을 칠할 수 있게
  let labelled: { emotion: string | null; feeling: string | null; topic: string | null; lang: string } | null = null
  const errors: string[] = []
  for (const s of targets) {
    if (!s.text?.trim()) continue
    try {
      const vec = await embed(s.text, apiKey)
      const vecJson = JSON.stringify(vec)
      const { error } = await admin
        .from('star_embeddings')
        .upsert({ star_id: s.id, embedding: vecJson, model: MODEL })
      if (error) throw error
      labelled = await label(s.id, s.text, vecJson)
      saved++
    } catch (err) {
      errors.push(String(err).slice(0, 200))
      if (errors.length >= 3) break // 키나 요금 문제면 더 부르지 않습니다
    }
  }
  if (errors.length) console.error('[잔별] 의미를 읽지 못한 별이 있어요', errors)
  return json({
    ok: errors.length === 0,
    saved,
    remaining: body.star_id ? 0 : Math.max(0, pendingTotal - saved),
    emotion: body.star_id ? labelled?.emotion ?? null : undefined,
    feeling: body.star_id ? labelled?.feeling ?? null : undefined,
    topic: body.star_id ? labelled?.topic ?? null : undefined,
    lang: body.star_id ? labelled?.lang ?? null : undefined,
    errors,
  })
})
