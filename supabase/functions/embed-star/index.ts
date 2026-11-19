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

const MODEL = 'gemini-embedding-001'
const DIM = 768
const BACKFILL_MAX = 40

/**
 * 감정의 기준 문장들.
 *
 * 한 감정에 여러 언어를 섞어 둡니다. 임베딩 모델이 언어를 넘나드는 데 약하더라도,
 * 영어 글은 영어 기준 문장에, 일본어 글은 일본어 기준 문장에 걸리면 되니까요.
 * 모델이 언어를 잘 넘나든다면 더 좋고요. **어느 쪽이든 작동하도록** 짠 구조입니다.
 *
 * 문장은 설명이 아니라 **그 마음으로 쓴 한 줄**이어야 합니다.
 * "기쁨이란 즐거운 감정이다" 같은 사전식 문장은 실제 일기와 닮지 않아요.
 */
const ANCHORS: Record<string, string[]> = {
  기쁨: [
    '오늘 좋은 일이 있었다. 자꾸 웃음이 났다.',
    '별거 아닌데 괜히 뿌듯하고 설렜다.',
    'Something good happened today and I keep smiling about it.',
    'I felt proud of myself for once. It was a small thing but it mattered.',
    '今日はいいことがあって、何度も思い出しては笑ってしまう。',
  ],
  평온: [
    '별일 없는 하루였다. 그게 좋았다.',
    '창문을 열어두고 한참 가만히 있었다. 마음이 조용했다.',
    'Nothing happened today and that was fine. I felt calm.',
    'I sat quietly for a while and my mind was still.',
    '何もない一日だった。静かで、悪くなかった。',
  ],
  그리움: [
    '문득 그 사람 생각이 났다. 보고 싶다.',
    '예전 그 시절이 자꾸 떠오른다. 다시 돌아갈 수는 없겠지.',
    'I thought of them out of nowhere today. I miss them.',
    'I keep remembering how things used to be.',
    'ふと、あの人のことを思い出した。会いたい。',
  ],
  슬픔: [
    '눈물이 났다. 마음이 먹먹하다.',
    '오늘은 그냥 좀 슬펐다. 이유를 모르겠다.',
    'I cried today. My chest feels heavy.',
    'I was just sad today and I do not know why.',
    '涙が出た。胸が苦しい。',
  ],
  고독: [
    '혼자였다. 아무도 내 하루를 묻지 않았다.',
    '사람들 속에 있었는데도 혼자인 것 같았다.',
    'I was alone today. Nobody asked how my day went.',
    'I was surrounded by people and still felt completely alone.',
    '一人だった。誰も私の一日を聞かなかった。',
  ],
  피로: [
    '너무 지쳤다. 아무것도 하기 싫다.',
    '하루 종일 일했다. 지금은 피곤할 뿐이다.',
    'I am exhausted. I do not want to do anything.',
    'Worked all day. Right now I am just tired.',
    'もう疲れた。何もしたくない。',
  ],
  불안: [
    '자꾸 걱정이 된다. 잘못될 것 같아서 잠이 안 온다.',
    '마음이 계속 조마조마하다. 뭔가 잘못될 것 같다.',
    'I keep worrying. I cannot sleep because something feels wrong.',
    'My chest is tight with worry about what comes next.',
    '不安で眠れない。何かうまくいかない気がする。',
  ],
  일상: [
    '밥을 먹고 산책을 했다. 그런 하루였다.',
    '별다를 것 없는 평범한 하루를 보냈다.',
    'I ate, I walked, I came home. That was the day.',
    'Just an ordinary day with nothing in particular.',
    'ご飯を食べて、散歩をして帰ってきた。そんな一日。',
  ],
}

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
 * 기준 문장들이 비어 있으면 채웁니다. 처음 한 번만 도는 길입니다.
 * 여기서 실패하면 감정은 비워둔 채 넘어갑니다 — 화면이 예전 사전으로 폴백하니까요.
 */
async function ensureAnchors(admin: ReturnType<typeof createClient>, apiKey: string) {
  const { count } = await admin
    .from('emotion_anchors')
    .select('emotion', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return

  for (const [emotion, phrases] of Object.entries(ANCHORS)) {
    for (const phrase of phrases) {
      const vec = await embed(phrase, apiKey)
      await admin
        .from('emotion_anchors')
        .upsert({ emotion, phrase, embedding: JSON.stringify(vec) })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: '로그인이 필요합니다' }, 401)
  const token = auth.replace(/^Bearer\s+/i, '').trim()

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const key = adminKey()
  if (!apiKey || !key) {
    console.error('[잔별] GEMINI_API_KEY 또는 관리자 키가 비어 있습니다 (Edge Functions → Secrets)')
    return json({ error: 'not configured' }, 500)
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  let body: { star_id?: string; redo?: boolean } = {}
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
  const isOwner = token === key
  const wholeSky = Boolean(body.redo) || !body.star_id
  if (wholeSky) {
    if (!isOwner) return json({ error: '관리자 키로만 할 수 있습니다' }, 403)
  } else if (!isOwner) {
    const { data: who } = await admin.auth.getUser(token)
    if (!who?.user) return json({ error: '누구인지 확인할 수 없습니다' }, 401)
  }

  // 기준 문장이 없으면 먼저 채웁니다
  try {
    await ensureAnchors(admin, apiKey)
  } catch (err) {
    console.error('[잔별] 감정 기준 문장을 못 만들었습니다', String(err).slice(0, 300))
  }

  /** 의미 하나로 감정을 고르고, 글자 모양으로 언어를 보고, 별에 적어둡니다 */
  const label = async (starId: string, text: string, vecJson: string) => {
    const { data: emotion } = await admin.rpc('emotion_for', { p_embedding: vecJson })
    const lang = langOf(text)
    await admin
      .from('stars')
      .update({ emotion: emotion ?? null, lang })
      .eq('id', starId)
    return { emotion: (emotion as string) ?? null, lang }
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
  let labelled: { emotion: string | null; lang: string } | null = null
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
    lang: body.star_id ? labelled?.lang ?? null : undefined,
    errors,
  })
})
