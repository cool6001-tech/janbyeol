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
 * 가려진 별(신고 누적)은 번역해 주지 않습니다. 번역이 우회로가 되면 안 되니까요.
 *
 * 필요한 비밀값
 *   GEMINI_API_KEY         — embed-star 와 같은 키
 *   JANBYEOL_SERVICE_KEY   — delete-account 와 같은 관리자 키
 *
 * 먼저 실행해 두셔야 하는 것: supabase/multilingual.sql
 *
 * 배포
 *   supabase functions deploy translate-star
 *   또는 대시보드 → Edge Functions → Deploy a new function → Via Editor
 *   (함수 이름은 반드시 translate-star)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'gemini-2.5-flash'

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

/** 'ko-KR' → 'ko'. 모르는 코드는 영어로 */
function normalizeLang(raw: unknown): string {
  const code = String(raw || '').toLowerCase().split('-')[0]
  return LANG_NAMES[code] ? code : 'en'
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
    '- Keep the writer\'s hesitations, trailing dots and line breaks as they are.',
    '- Do not polish, summarize, shorten or add anything.',
    '- If it is already in the target language, return it unchanged.',
    '',
    '---',
    text.slice(0, 2000),
  ].join('\n')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    }
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const out: string = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string }) => p?.text || '')
    .join('')
    .trim()
  if (!out) throw new Error('Gemini 가 빈 답을 보냈어요')
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: '로그인이 필요합니다' }, 401)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const key = adminKey()
  if (!apiKey || !key) {
    console.error('[잔별] GEMINI_API_KEY 또는 관리자 키가 비어 있습니다')
    return json({ error: '지금은 옮겨 읽을 수 없어요' }, 500)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  // 부른 사람이 누구인지 — 익명 계정도 괜찮습니다. 아무나는 안 됩니다.
  const { data: who } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!who?.user) return json({ error: '누구인지 확인할 수 없습니다' }, 401)

  let body: { star_id?: string; lang?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* 아래에서 거릅니다 */
  }
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
    console.error('[잔별] 옮겨 읽지 못했어요', String(err).slice(0, 300))
    return json({ error: '지금은 옮겨 읽을 수 없어요. 잠시 뒤에 다시 해주세요.' }, 502)
  }

  // 저장이 실패해도 번역문은 돌려줍니다 — 다음 사람이 한 번 더 부를 뿐이니까요
  const { error: saveErr } = await admin
    .from('star_translations')
    .upsert({ star_id: starId, lang, text: out })
  if (saveErr) console.error('[잔별] 번역을 저장하지 못했어요', saveErr.message)

  return json({ ok: true, text: out, lang, cached: false })
})
