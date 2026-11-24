/**
 * 잔별 옮겨 읽기 — 다른 언어로 쓴 별을 내 말로
 * ---------------------------------------------------------------
 * 잔별은 누가 어느 나라 말로 썼든 같은 마음이면 가까이 두는 하늘입니다.
 * 그런데 가까이 있어도 못 읽으면 소용이 없죠. 그래서 번역입니다.
 *
 * 원칙 두 가지
 *   · **부르는 사람이 눌렀을 때만** 번역합니다. 미리 전부 번역해 두지 않아요.
 *     읽히지도 않을 글을 번역하는 건 돈과 전기를 버리는 일입니다.
 *   · **한 번 번역한 것은 저장합니다.** 같은 별을 백 명이 열어도 Gemini 를
 *     부르는 건 첫 한 번뿐입니다.
 *
 * 부르는 법
 *   { star_id: "s-xxxx", lang: "ko" }
 *   → { ok: true, text: "...", lang: "ko", cached: true|false }
 *
 *   { probe: true }
 *   → 이 열쇠로 부를 수 있는 모델 목록. 번역이 안 될 때 원인을 보는 창입니다.
 *
 * 가려진 별(신고 누적)은 번역해 주지 않습니다. 번역이 우회로가 되면 안 되니까요.
 *
 * 모델에 대하여 — 2026년 11월
 *   2.5 세대는 '예전에 써 본 열쇠'만 부를 수 있게 막혔습니다. 잔별의 열쇠는
 *   임베딩(gemini-embedding-001)만 써 왔으니 2.5-flash 는 404 로 돌아옵니다.
 *   그래서 **지금 세대부터 차례로** 불러 보고, 막힌 모델은 건너뜁니다.
 *   한 세대가 또 저물어도 함수를 고치러 오지 않아도 되게.
 *
 * 필요한 비밀값
 *   GEMINI_API_KEY         — embed-star 와 같은 키
 *   JANBYEOL_SERVICE_KEY   — delete-account 와 같은 관리자 키
 *
 * 먼저 실행해 두셔야 하는 것: supabase/multilingual.sql
 *
 * 배포
 *   supabase functions deploy translate-star
 *   또는 대시보드 → Edge Functions → translate-star → Code → 붙여넣고 Deploy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** 앞에서부터 불러 봅니다. 막혀 있으면 다음 모델로. */
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-2.5-flash']

/** 우리가 이름을 아는 언어들. 모르는 코드가 오면 영어로 보냅니다. */
const LANG_NAMES: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese (Simplified)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ru: 'Russian',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ar: 'Arabic',
  hi: 'Hindi',
  it: 'Italian',
  tr: 'Turkish',
}

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
 * 하나만 집으면 안 됩니다. 키를 갈아끼우는 동안에는 프로젝트에 키가 둘이고,
 * 그중 어느 쪽을 들고 오셔도 주인은 주인이니까요. (embed-star 와 같은 이유)
 */
function adminKeys(): string[] {
  const keys: string[] = []
  const add = (v: unknown) => {
    if (typeof v === 'string' && v && !keys.includes(v)) keys.push(v)
  }
  add(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const bundle = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle)
      const items = Array.isArray(parsed) ? parsed : Object.values(parsed)
      for (const it of items) {
        if (typeof it === 'string') add(it)
        else if (it && typeof it === 'object') {
          const v = it as Record<string, unknown>
          add(v.api_key ?? v.key ?? v.secret)
        }
      }
    } catch {
      /* 모양이 다르면 건너뜁니다 */
    }
  }
  add(Deno.env.get('JANBYEOL_SERVICE_KEY'))
  return keys
}

/** 'ko-KR' → 'ko'. 모르는 코드는 영어로 */
function normalizeLang(raw: unknown): string {
  const code = String(raw || '').toLowerCase().split('-')[0]
  return LANG_NAMES[code] ? code : 'en'
}

/* ---------------- Gemini ---------------- */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'

/** 이 열쇠로 부를 수 있는 모델들. 막혔을 때 눈으로 확인하는 창. */
async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  return (data?.models || [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      (m.supportedGenerationMethods || []).includes('generateContent')
    )
    .map((m: { name?: string }) => String(m.name || '').replace(/^models\//, ''))
}

/** 못 쓰는 모델인가 — 다음 모델로 넘어가야 하는 응답들 */
const unusable = (status: number) => status === 404 || status === 403 || status === 400

/**
 * 한 모델에게 한 번 물어봅니다.
 *
 * 3 세대는 기본으로 '생각'을 합니다. 생각한 토큰도 maxOutputTokens 에서
 * 깎이기 때문에, 짧게 잡으면 생각만 하다가 **빈 답**이 돌아옵니다.
 * 일기 한 편 옮기는 데 깊은 사유는 필요 없으니 생각은 최소로, 그릇은 넉넉히.
 * 다만 이 설정을 모르는 모델도 있어서, 투정하면 빼고 한 번 더 부릅니다.
 */
async function ask(model: string, prompt: string, apiKey: string, thinking: boolean) {
  const generationConfig: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: 4096 }
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: 'minimal' }

  const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
  })
  const raw = await res.text()
  if (!res.ok) return { ok: false as const, status: res.status, raw: raw.slice(0, 300) }

  const data = JSON.parse(raw)
  const text: string = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string; thought?: boolean }) => (p?.thought ? '' : p?.text || ''))
    .join('')
    .trim()
  const finish = String(data?.candidates?.[0]?.finishReason || '')
  return { ok: true as const, text, finish }
}

/**
 * 번역.
 *
 * 말투가 중요합니다. 잔별에 올라오는 글은 보고서가 아니라 혼잣말이에요.
 * 매끄럽게 다듬어버리면 그 사람의 머뭇거림과 말줄임이 사라집니다.
 * 그래서 "자연스럽게"보다 **"있는 그대로"** 를 먼저 시킵니다.
 */
async function translate(text: string, lang: string, apiKey: string): Promise<string> {
  const target = LANG_NAMES[lang] || 'English'
  const prompt = [
    `Translate the diary entry below into ${target}.`,
    '',
    'Rules:',
    `- Output ONLY the translation in ${target}. No notes, no quotes, no romanization.`,
    '- It is a private journal entry, not an article. Keep the casual, inward tone.',
    "- Keep the writer's hesitations, trailing dots and line breaks as they are.",
    '- Do not polish, summarize, shorten or add anything.',
    '- If it is already in the target language, return it unchanged.',
    '',
    '---',
    text.slice(0, 2000),
  ].join('\n')

  const tried: string[] = []
  for (const model of MODELS) {
    for (const thinking of [true, false]) {
      const r = await ask(model, prompt, apiKey, thinking)

      if (!r.ok) {
        tried.push(`${model}${thinking ? '+t' : ''} → ${r.status} ${r.raw}`)
        // 설정을 모르는 모델이면 설정을 빼고 한 번 더, 아니면 다음 모델로
        if (r.status === 400 && thinking) continue
        if (unusable(r.status)) break
        throw new Error(tried.join(' | '))
      }

      if (r.text) return r.text

      // 빈 답 — 생각만 하다 그릇이 찼거나 안전 필터에 걸렸습니다
      tried.push(`${model}${thinking ? '+t' : ''} → 빈 답 (${r.finish || 'no finishReason'})`)
      if (thinking) continue // 생각을 끄고 한 번 더
      break // 이 모델은 포기, 다음 모델로
    }
  }
  throw new Error(tried.join(' | ') || '부를 수 있는 모델이 없습니다')
}

/* ---------------- 입구 ---------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: '로그인이 필요합니다' }, 401)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const adminList = adminKeys()
  const key = adminList[0] ?? null
  if (!apiKey || !key) {
    console.error('[잔별] GEMINI_API_KEY 또는 관리자 키가 비어 있습니다')
    return json({ error: '지금은 옮겨 읽을 수 없어요' }, 500)
  }

  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  let body: { star_id?: string; lang?: string; probe?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* 아래에서 거릅니다 */
  }

  // 열쇠가 부를 수 있는 모델 보기 — 번역이 막혔을 때 여기부터 봅니다.
  //
  // 이건 사람이 쓰는 길이 아니라 **주인이 들여다보는 창**입니다. 그래서
  // 익명 계정이 아니라 관리자 키로만 엽니다. 모델 이름이 비밀은 아니지만,
  // 아무나 부를 수 있는 문은 안 만드는 게 낫습니다.
  if (body.probe) {
    if (!adminList.includes(token)) return json({ error: '관리자 키로만 볼 수 있습니다' }, 403)
    try {
      const models = await listModels(apiKey)
      return json({ ok: true, candidates: MODELS, available: models })
    } catch (err) {
      return json({ error: String(err).slice(0, 300) }, 502)
    }
  }

  // 부른 사람이 누구인지 — 익명 계정도 괜찮습니다. 아무나는 안 됩니다.
  const { data: who } = await admin.auth.getUser(token)
  if (!who?.user) return json({ error: '누구인지 확인할 수 없습니다' }, 401)

  const starId = String(body.star_id || '')
  const lang = normalizeLang(body.lang)
  if (!starId) return json({ error: '어느 별인지 알려주세요' }, 400)

  // 이미 옮겨둔 게 있으면 그걸로
  const { data: cached } = await admin
    .from('star_translations')
    .select('text')
    .eq('star_id', starId)
    .eq('lang', lang)
    .maybeSingle()
  if (cached?.text) return json({ ok: true, text: cached.text, lang, cached: true })

  // 가려진 별은 옮겨주지 않습니다 — 번역이 우회로가 되면 안 됩니다
  const { data: star } = await admin
    .from('stars')
    .select('text, is_hidden')
    .eq('id', starId)
    .maybeSingle()
  if (!star || star.is_hidden) return json({ error: '지금은 읽을 수 없는 잔별이에요' }, 404)

  let out: string
  try {
    out = await translate(star.text as string, lang, apiKey)
  } catch (err) {
    const detail = String(err).slice(0, 400)
    console.error('[잔별] 옮겨 읽지 못했어요', detail)
    // detail 에는 비밀값이 없습니다 — 모델 이름과 Gemini 가 준 사유뿐입니다.
    // 화면에는 안 보이지만 콘솔에 남아서, 다음에 또 막히면 바로 보입니다.
    return json({ error: '지금은 옮겨 읽을 수 없어요. 잠시 뒤에 다시 해주세요.', detail }, 502)
  }

  // 저장이 실패해도 번역문은 돌려줍니다 — 다음 사람이 한 번 더 부를 뿐이니까요
  const { error: saveErr } = await admin
    .from('star_translations')
    .upsert({ star_id: starId, lang, text: out })
  if (saveErr) console.error('[잔별] 번역을 저장하지 못했어요', saveErr.message)

  return json({ ok: true, text: out, lang, cached: false })
})
