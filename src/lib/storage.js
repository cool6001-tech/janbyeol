/**
 * 저장소 계층 (Repository) — 서버판
 * ---------------------------------------------------------------
 * 예전엔 이 파일이 localStorage를 읽고 썼습니다. 이제 Supabase를 봅니다.
 * 화면 컴포넌트들은 여전히 "잔별이 어디에 저장되는지" 모릅니다.
 *
 * 계약이 두 개 늘었습니다. 브라우저에 혼자 있을 땐 온기도 답글도 그냥
 * 배열을 고쳐 쓰면 됐지만, 서버에서는 **의도를 말해야** 하기 때문입니다.
 * (남의 글의 warmth 숫자를 내가 직접 고쳐 쓰게 두면 안 되니까요.)
 *
 *   listStars()              → Promise<Star[]>     모두의 하늘
 *   createStar(star)         → Promise<Star>
 *   warm(starId, on)         → Promise<number>     새 온기 수
 *   addReply(starId, text)   → Promise<Reply>
 *   report(target, reason)   → Promise<void>
 *   block(userId)            → Promise<void>
 *   clearAll()               → Promise<void>       내 별만 지웁니다
 *
 * 읽음 기록(readLog)과 첫 안내(onboarding)는 **그대로 브라우저에 둡니다.**
 * 읽음이 서버로 나가는 순간 카톡의 '1' 같은 압박이 생기고, 그건 이 서비스가
 * 절대 만들면 안 되는 감정입니다. 원래 주석에 적어두신 그 이유 그대로입니다.
 */

import { sb, PHOTO_BUCKET } from './supabase.js'
import { emotionOf } from './emotionColor.js'

/* 한 번에 불러오는 별의 수. 은하가 커지면 이 숫자가 성능의 손잡이입니다. */
const SKY_LIMIT = 500

/* ---------------------------------------------------------------
   나를 식별하는 값

   로그인 버튼은 없습니다. 처음 온 사람에게도 서버가 조용히 익명 계정을
   하나 내어줍니다. 나중에 '내 성단 지키기'를 누르면 이 익명 계정에
   카카오/구글을 **덧붙여서** 같은 계정 그대로 기기를 넘어갑니다.
   (새 계정을 만드는 게 아니라 연결이라, 띄운 별을 하나도 안 잃습니다.)
--------------------------------------------------------------- */
let cachedUser = { id: null, name: '나', isAnonymous: true }
let authPromise = null

/** 화면이 render 중에 물어볼 때 — 아직 모르면 id가 null입니다 */
export function currentUser() {
  return cachedUser
}

/** 준비될 때까지 기다리는 쪽 — 훅에서 씁니다 */
export function ensureUser() {
  if (!authPromise) authPromise = resolveUser()
  return authPromise
}

/* ---------------------------------------------------------------
   다른 기기에서 이미 지킨 성단으로 들어가기

   폰에서 '카카오로 지키기'를 한 사람이 PC에서 또 누르면, PC의 새 익명 계정에
   그 카카오를 붙일 수 없습니다 (이미 폰의 계정에 붙어 있으니까요).
   Supabase 는 이때 주소에 error_code=identity_already_exists 를 달아 돌려보냅니다.

   그 답을 받으면:
     ① 지금 익명 계정의 토큰을 잠시 적어두고
     ② 같은 제공자로 **로그인**해서 원래 성단으로 들어간 뒤
     ③ merge-anonymous 함수가 이 기기에서 띄운 별을 원래 성단으로 옮깁니다.
   그래서 폰과 PC가 같은 성단을 보게 됩니다.
--------------------------------------------------------------- */
const LINK_KEY = 'janbyeol.link.pending'
const MERGE_KEY = 'janbyeol.merge.pending'
const FRESH_MS = 30 * 60 * 1000

// 첫 화면의 주소를 가장 먼저 붙잡아 둡니다 (다른 코드가 주소를 정리하기 전에)
const landingUrl = typeof window !== 'undefined' ? window.location.href : ''
let authNotice = null

export function rememberPendingLink(provider) {
  safeSet(LINK_KEY, JSON.stringify({ provider, at: Date.now() }))
}

/** 로그인 직후 한 번만 보여줄 안내 — App 이 꺼내 갑니다 */
export function takeAuthNotice() {
  const n = authNotice
  authNotice = null
  return n
}

function readJSON(key) {
  try {
    const v = JSON.parse(safeGet(key) || 'null')
    return v && Date.now() - (v.at || 0) < FRESH_MS ? v : null
  } catch {
    return null
  }
}
function forget(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* 무시 */
  }
}

/** 소셜 로그인에서 돌아온 주소의 오류 코드 (쿼리·해시 둘 다 봅니다) */
function authErrorFromUrl() {
  try {
    const u = new URL(landingUrl)
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''))
    const pick = (k) => u.searchParams.get(k) || hash.get(k)
    const code = pick('error_code')
    const desc = pick('error_description') || ''
    if (!code && !pick('error')) return null
    return { code, desc }
  } catch {
    return null
  }
}

function cleanAuthParams() {
  try {
    const u = new URL(window.location.href)
    ;['error', 'error_code', 'error_description'].forEach((k) => u.searchParams.delete(k))
    const clean = u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '')
    window.history.replaceState(null, '', clean)
  } catch {
    /* 무시 */
  }
}

async function resolveUser() {
  let { data } = await sb.auth.getSession()

  // ── ①② 이미 다른 계정에 붙은 카카오/구글 → 그 계정으로 로그인하러 갑니다
  const authErr = authErrorFromUrl()
  if (authErr) {
    cleanAuthParams()
    const pending = readJSON(LINK_KEY)
    forget(LINK_KEY)
    const taken =
      authErr.code === 'identity_already_exists' || /already linked|already exists/i.test(authErr.desc)
    if (taken && pending?.provider) {
      if (data.session?.user?.is_anonymous) {
        safeSet(MERGE_KEY, JSON.stringify({ fromToken: data.session.access_token, at: Date.now() }))
      }
      const { error } = await sb.auth.signInWithOAuth({
        provider: pending.provider,
        options: { redirectTo: `${window.location.origin}/` },
      })
      if (!error) return new Promise(() => {}) // 곧 페이지를 떠납니다
      console.error('[잔별] 원래 성단으로 들어가지 못했습니다.', error)
    } else if (authErr.code || authErr.desc) {
      console.error('[잔별] 소셜 연결이 끝나지 않았습니다.', authErr)
      authNotice = '연결을 마치지 못했어요. 잠시 뒤에 다시 해주세요.'
    }
  } else if (data.session && !data.session.user.is_anonymous) {
    // 연결이 정상적으로 끝났으면 기다리던 표시는 지웁니다
    forget(LINK_KEY)
  }

  if (!data.session) {
    const { data: anon, error } = await sb.auth.signInAnonymously()
    if (error) {
      console.error('[잔별] 익명 계정을 만들지 못했습니다.', error)
      return cachedUser
    }
    data = { session: anon.session }
  }

  const user = data.session.user

  // ── ③ 로그인해서 돌아왔다면, 이 기기의 익명 성단을 옮겨 담습니다
  const merge = readJSON(MERGE_KEY)
  if (merge && !user.is_anonymous) {
    forget(MERGE_KEY)
    try {
      const { data: res, error } = await sb.functions.invoke('merge-anonymous', {
        body: { fromToken: merge.fromToken },
      })
      if (error) throw error
      authNotice =
        res?.moved > 0
          ? `다시 만났어요. 이 기기에서 띄운 잔별 ${res.moved}개도 내 성단에 함께 담았어요.`
          : '다시 만났어요. 다른 기기에서 지킨 성단을 그대로 불러왔어요.'
    } catch (err) {
      console.error('[잔별] 이 기기의 별을 옮기지 못했습니다.', err)
      authNotice = '다른 기기에서 지킨 성단을 불러왔어요.'
    }
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle()

  cachedUser = {
    id: user.id,
    name: profile?.name || '나',
    // 익명인지 아닌지 — '내 성단 지키기' 버튼을 보여줄지 정하는 값
    isAnonymous: user.is_anonymous ?? !user.email,
  }
  return cachedUser
}

/** 로그인 상태가 바뀌면(연결/로그아웃) 알려줍니다 */
export function onAuthChange(cb) {
  const { data } = sb.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
      authPromise = null
      cb(await ensureUser())
    }
  })
  return () => data.subscription.unsubscribe()
}

/* ---------------------------------------------------------------
   서버의 행 ↔ 화면이 아는 잔별

   화면 코드는 예전 모양 그대로 씁니다 (camelCase, warmedBy, replies).
   그래서 번역을 여기서만 합니다.
--------------------------------------------------------------- */
function toStar(row, myWarmed, repliesByStar) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name || '어떤 사람',
    text: row.text,
    tags: row.tags || [],
    photo: row.photo_url || null,
    photoSeed: row.photo_seed || null,
    createdAt: row.created_at,
    pos: row.pos,
    posV: row.pos_v,
    warmth: row.warmth || 0,
    // ⚠️ 누가 온기를 줬는지는 내려보내지 않습니다. **내가 줬는지만** 압니다.
    //    "이 사람이 내 글에 온기를 안 줬네" 를 셀 수 있게 되는 순간
    //    이 서비스는 다른 종류의 서비스가 됩니다.
    warmedBy: myWarmed.has(row.id) ? [cachedUser.id] : [],
    replies: repliesByStar.get(row.id) || [],
    seeded: row.seeded || false,
    allowFeature: row.allow_feature === true,
  }
}

/** 남에게 보일 이름 — 기본값 '나'는 내 화면에서만 맞는 말이라 '어떤 사람'으로 */
function nameOf(name) {
  return name && name !== '나' ? name : '어떤 사람'
}

export const storage = {
  /**
   * 모두의 하늘.
   * RLS가 가려진 별과 내가 차단한 사람의 별을 서버에서 이미 빼고 줍니다.
   */
  async listStars() {
    await ensureUser()

    const [{ data: rows, error }, { data: mine }, { data: reps }] = await Promise.all([
      sb
        .from('stars')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(SKY_LIMIT),
      sb.from('warmths').select('star_id').eq('user_id', cachedUser.id),
      sb
        .from('replies')
        .select('id, star_id, text, created_at, author_id, profiles(name)')
        .order('created_at', { ascending: true })
        .limit(2000),
    ])

    // 조용히 빈 하늘을 돌려주면 "별이 하나도 없네" 로 보입니다.
    // 무엇이 잘못됐는지는 부르는 쪽이 알아야 합니다.
    if (error) throw error

    const myWarmed = new Set((mine || []).map((w) => w.star_id))
    const repliesByStar = new Map()
    for (const r of reps || []) {
      const list = repliesByStar.get(r.star_id) || []
      list.push({
        id: r.id,
        // 이름을 아직 정하지 않은 사람('나')은 남에게 '어떤 사람'으로 보입니다
        who: r.author_id === cachedUser.id ? '나' : nameOf(r.profiles?.name),
        text: r.text,
        createdAt: r.created_at,
      })
      repliesByStar.set(r.star_id, list)
    }

    return (rows || []).map((row) => toStar(row, myWarmed, repliesByStar))
  },

  /** 잔별 띄우기 — 좌표는 화면에서 정해서 넘어옵니다 */
  async createStar(star) {
    await ensureUser()

    // 사진은 base64로 들고 다니면 금방 무거워집니다. 스토리지에 올리고 주소만 저장.
    let photoUrl = null
    if (star.photo?.startsWith('data:')) {
      photoUrl = await uploadPhoto(star.photo, star.id)
    } else if (star.photo) {
      photoUrl = star.photo
    }

    const { data, error } = await sb
      .from('stars')
      .insert({
        id: star.id,
        author_id: cachedUser.id,
        // author_name 은 보내지 않습니다 — 서버가 내 프로필 이름으로 채웁니다 (사칭 방지)
        text: star.text,
        tags: star.tags,
        emotion: emotionOf(star), // 인스타 카드와 색이 여기서 정해집니다
        photo_url: photoUrl,
        photo_seed: star.photoSeed,
        pos: star.pos,
        pos_v: star.posV,
        // seeded · warmth 같은 칸도 보내지 않습니다 — 서버만 정할 수 있는 값입니다
        // 글쓴이가 '소개해도 좋아요'를 직접 체크했을 때만 true
        allow_feature: star.allowFeature === true,
      })
      .select()
      .single()

    if (error) throw error
    return toStar(data, new Set(), new Map())
  },

  /**
   * 온기 더하기 / 거두기
   * 숫자를 직접 고치지 않습니다. 한 줄을 넣거나 빼면 서버 트리거가 셉니다.
   * 그래서 같은 사람이 두 번 눌러도, 두 기기에서 동시에 눌러도 정확합니다.
   */
  async warm(starId, on) {
    await ensureUser()

    if (on) {
      const { error } = await sb
        .from('warmths')
        .insert({ star_id: starId, user_id: cachedUser.id })
      // 이미 준 온기를 또 넣으려 한 것 — 결과는 같으니 조용히 넘어갑니다
      if (error && error.code !== '23505') throw error
    } else {
      const { error } = await sb
        .from('warmths')
        .delete()
        .eq('star_id', starId)
        .eq('user_id', cachedUser.id)
      if (error) throw error
    }

    const { data } = await sb.from('stars').select('warmth').eq('id', starId).maybeSingle()
    return data?.warmth ?? 0
  },

  /** 별빛 이어가기 */
  async addReply(starId, text) {
    await ensureUser()
    const { data, error } = await sb
      .from('replies')
      .insert({ star_id: starId, author_id: cachedUser.id, text: text.trim() })
      .select()
      .single()
    if (error) throw error
    return { id: data.id, who: '나', text: data.text, createdAt: data.created_at }
  },

  /**
   * 공식 계정 소개 — '앞으로 띄울 잔별' 전체에 대한 한 번의 선택
   * 처음 잔별을 띄울 때 한 번만 묻고, 그 답을 계정(user_metadata)에 적어 둡니다.
   * 다른 사람은 볼 수 없는 자리라, 동의 여부가 남에게 드러나지 않습니다.
   *   true  — 앞으로 띄우는 잔별은 소개해도 좋아요
   *   false — 소개하지 말아 주세요
   *   null  — 아직 묻지 않았어요
   */
  async getFeaturePref() {
    await ensureUser()
    const { data } = await sb.auth.getSession()
    const v = data.session?.user?.user_metadata?.feature_ok
    return typeof v === 'boolean' ? v : null
  },

  /** 한 번의 선택을 바꿉니다. 끄면 지금까지 허락한 잔별도 모두 거둡니다 (약관 제9조) */
  async setFeaturePref(on) {
    await ensureUser()
    const { error } = await sb.auth.updateUser({
      data: { feature_ok: on, feature_ok_at: new Date().toISOString() },
    })
    if (error) throw error
    if (!on) {
      const { error: e2 } = await sb
        .from('stars')
        .update({ allow_feature: false })
        .eq('author_id', cachedUser.id)
        .eq('allow_feature', true)
      if (e2) throw e2
    }
  },

  /** 잔별 하나의 소개 허락 바꾸기 — 카드에서 이 별만 거둘 때 */
  async setAllowFeature(starId, on) {
    await ensureUser()
    const { error } = await sb
      .from('stars')
      .update({ allow_feature: on })
      .eq('id', starId)
      .eq('author_id', cachedUser.id)
    if (error) throw error
  },

  /** 신고 — 애플 1.2 가 요구하는 기능이자, 여기 있어야 할 기능입니다 */
  async report({ starId, replyId }, reason) {
    await ensureUser()
    const { error } = await sb.from('reports').insert({
      star_id: starId ?? null,
      reply_id: replyId ?? null,
      reporter_id: cachedUser.id,
      reason,
    })
    if (error) throw error
  },

  /** 차단 — 이 사람의 별은 내 하늘에서 사라집니다 (RLS가 걸러줍니다) */
  async block(userId) {
    await ensureUser()
    const { error } = await sb
      .from('blocks')
      .insert({ blocker_id: cachedUser.id, blocked_id: userId })
    if (error && error.code !== '23505') throw error
  },

  async unblock(userId) {
    await ensureUser()
    await sb.from('blocks').delete().eq('blocker_id', cachedUser.id).eq('blocked_id', userId)
  },

  /** 차단한 사람들 — '나의 성단'에서 풀 수 있게 */
  async blockedList() {
    await ensureUser()
    const { data } = await sb
      .from('blocks')
      .select('blocked_id, profiles!blocks_blocked_id_fkey(name)')
      .eq('blocker_id', cachedUser.id)
    return (data || []).map((b) => ({ id: b.blocked_id, name: nameOf(b.profiles?.name) }))
  },

  /**
   * 별 하나만 거둡니다.
   *
   * 쓰고 나서 후회하는 순간이 반드시 옵니다. 그때 **전부 지우는 것 말고**
   * 그 하나만 내릴 길이 있어야 합니다. 온기와 답글은 외래키 cascade 로
   * 함께 사라지고, 올린 사진도 같이 지웁니다 — 글만 지우고 사진이 주소로
   * 남아 있으면 지웠다고 말할 수 없으니까요.
   *
   * `author_id` 조건은 RLS 와 겹치는 안전장치입니다. 둘 중 하나가
   * 무너져도 남의 별은 지워지지 않습니다.
   */
  async removeStar(starId) {
    await ensureUser()

    const { data: star } = await sb
      .from('stars')
      .select('photo_url')
      .eq('id', starId)
      .eq('author_id', cachedUser.id)
      .maybeSingle()

    if (star?.photo_url) {
      const path = photoPathOf(star.photo_url)
      if (path) await sb.storage.from(PHOTO_BUCKET).remove([path])
    }

    const { error } = await sb
      .from('stars')
      .delete()
      .eq('id', starId)
      .eq('author_id', cachedUser.id)
    if (error) throw error
  },

  /** 내가 띄운 별을 전부 거둡니다 (남의 별은 건드리지 않습니다) */
  async clearAll() {
    await ensureUser()
    const { error } = await sb.from('stars').delete().eq('author_id', cachedUser.id)
    if (error) throw error
  },
}

/** 공개 주소에서 버킷 안의 경로만 뽑아냅니다 (…/star-photos/<유저>/<별>.jpg) */
function photoPathOf(publicUrl) {
  const marker = `/${PHOTO_BUCKET}/`
  const at = publicUrl.indexOf(marker)
  return at === -1 ? null : publicUrl.slice(at + marker.length)
}

/* ---------------------------------------------------------------
   사진 올리기
--------------------------------------------------------------- */
async function uploadPhoto(dataUrl, starId) {
  try {
    const blob = await shrinkPhoto(dataUrl)
    const path = `${cachedUser.id}/${starId}.jpg`
    const { error } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    if (error) throw error
    return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
  } catch (err) {
    console.error('[잔별] 사진을 올리지 못했습니다. 글만 올립니다.', err)
    return null
  }
}

/**
 * 올리기 전에 사진을 다시 그립니다 — 긴 변 1600px, JPEG.
 *
 * 크기를 줄이는 것보다 더 중요한 이유가 있어요. 휴대폰 사진 원본에는
 * **찍은 장소의 GPS 좌표**와 기기 정보(EXIF)가 들어 있습니다. 사진 저장소는 공개라서
 * 원본을 그대로 올리면 누구나 그 좌표를 읽을 수 있어요. 캔버스에 다시 그리면
 * 픽셀만 남고 그런 정보는 모두 떨어져 나갑니다.
 */
function shrinkPhoto(dataUrl, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 줄이지 못했습니다'))), 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('사진을 읽지 못했습니다'))
    img.src = dataUrl
  })
}

/* ---------------------------------------------------------------
   읽은 잔별 — 별길의 재료   ※ 서버로 보내지 않습니다

   온기는 모두의 것이지만 **읽음은 내 것**이에요.
   읽음이 글쓴이에게 보이는 순간 카톡의 '1' 같은 압박이 생깁니다.
   읽씹당했다는 감각은 이 서비스가 절대 만들면 안 되는 감정이라,
   이 기록은 내 브라우저 밖으로 나가지 않습니다.

   순서가 곧 데이터입니다 — 배열인 이유예요. 길은 순서대로 이어지니까요.
--------------------------------------------------------------- */
const READ_KEY = 'janbyeol.read.v1'
let readCache = null

function safeGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** 별길은 하루만 남깁니다 — 읽은 지(다시 읽은 지) 24시간이 지난 자리는 지워져요 */
const READ_TTL_MS = 24 * 3600 * 1000

function freshOnly(list) {
  const cut = Date.now() - READ_TTL_MS
  return list.filter((r) => new Date(r.lastAt || r.at).getTime() > cut)
}

function readLogAll() {
  if (!readCache) {
    try {
      const parsed = JSON.parse(safeGet(READ_KEY) || '[]')
      readCache = Array.isArray(parsed) ? parsed : []
    } catch {
      readCache = []
    }
  }
  const fresh = freshOnly(readCache)
  if (fresh.length !== readCache.length) {
    readCache = fresh
    safeSet(READ_KEY, JSON.stringify(readCache))
  }
  return readCache
}

export const readLog = {
  /** 읽은 순서대로 [{ id, at }] */
  async list() {
    return readLogAll()
  },

  /**
   * 한 잔별을 읽었다고 기록한다.
   * 이미 지나간 자리는 그대로 둡니다. 다시 읽을 때마다 끝으로 옮기면
   * 길이 되감기면서 고리가 생겨요.
   */
  async add(id) {
    const list = readLogAll()
    const found = list.find((r) => r.id === id)
    const now = new Date().toISOString()
    if (found) {
      found.lastAt = now
    } else {
      list.push({ id, at: now })
      if (list.length > 600) list.splice(0, list.length - 600)
    }
    readCache = [...list]
    safeSet(READ_KEY, JSON.stringify(readCache))
    return readCache
  },

  /** 별길을 지운다 (띄운 잔별은 그대로) */
  async clear() {
    readCache = []
    try {
      window.localStorage.removeItem(READ_KEY)
    } catch {
      /* 무시 */
    }
    return readCache
  },
}

/* ---------------------------------------------------------------
   첫 안내(튜토리얼)를 봤는지 — 이것도 내 것, 브라우저에 둡니다
--------------------------------------------------------------- */
const TOUR_KEY = 'janbyeol.tour.v1'
let tourSeenInMemory = false

export const onboarding = {
  seen() {
    return tourSeenInMemory || Boolean(safeGet(TOUR_KEY))
  },
  markSeen() {
    tourSeenInMemory = true
    safeSet(TOUR_KEY, new Date().toISOString())
  },
  reset() {
    tourSeenInMemory = false
    try {
      window.localStorage.removeItem(TOUR_KEY)
    } catch {
      /* 무시 */
    }
  },
}
