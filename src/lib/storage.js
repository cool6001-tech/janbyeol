/**
 * 저장소 계층 (Repository)
 * ---------------------------------------------------------------
 * 앱의 나머지 코드는 "잔별이 어디에 저장되는지" 몰라야 합니다.
 * 이 파일만 갈아끼우면 브라우저 저장 → 서버 DB로 전환됩니다.
 *
 * 지켜야 할 계약(interface) — 네 개뿐입니다.
 *   listStars()            → Promise<Star[]>
 *   createStar(star)       → Promise<Star>
 *   updateStar(id, patch)  → Promise<Star>
 *   clearAll()             → Promise<void>
 *
 * 모두 Promise를 돌려주도록 맞춰두었습니다. 지금은 즉시 끝나지만,
 * 나중에 네트워크를 타게 되어도 호출하는 쪽 코드를 한 줄도 안 고쳐도 됩니다.
 * 파일 맨 아래에 Supabase 교체 예시를 주석으로 남겨뒀습니다.
 */

const STARS_KEY = 'janbyeol.stars.v1'
const ME_KEY = 'janbyeol.me.v1'

/* ---------------------------------------------------------------
   나를 식별하는 값
   지금은 브라우저마다 하나씩 만들어 둡니다.
   로그인을 붙이면 이 함수가 로그인된 사용자 ID를 돌려주면 됩니다.
--------------------------------------------------------------- */
export function currentUser() {
  let id = safeGet(ME_KEY)
  if (!id) {
    id = 'me-' + Math.random().toString(36).slice(2, 10)
    safeSet(ME_KEY, id)
  }
  return { id, name: '나' }
}

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
    // 사생활 보호 모드나 저장 공간 초과 — 앱은 메모리만으로도 돌아가야 합니다.
    return false
  }
}

/* ---------------------------------------------------------------
   브라우저 저장 구현
--------------------------------------------------------------- */
let memoryCache = null

function readAll() {
  if (memoryCache) return memoryCache
  const raw = safeGet(STARS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    memoryCache = Array.isArray(parsed) ? parsed : null
    return memoryCache
  } catch {
    return null
  }
}

function writeAll(stars) {
  memoryCache = stars
  safeSet(STARS_KEY, JSON.stringify(stars))
}

export const storage = {
  /** 저장된 잔별 전체. 한 번도 저장한 적이 없으면 null(= 첫 방문) */
  async listStars() {
    return readAll()
  },

  /** 잔별 하나를 띄운다. 좌표까지 이때 확정되어 함께 저장됩니다. */
  async createStar(star) {
    const stars = readAll() || []
    const next = [...stars, star]
    writeAll(next)
    return star
  },

  /** 온기·별빛처럼 나중에 바뀌는 값만 골라서 갱신 */
  async updateStar(id, patch) {
    const stars = readAll() || []
    let updated = null
    const next = stars.map((s) => {
      if (s.id !== id) return s
      updated = { ...s, ...patch }
      return updated
    })
    writeAll(next)
    return updated
  },

  /** 처음 상태로 (예시 기록까지 전부 지움) */
  async clearAll() {
    memoryCache = null
    try {
      window.localStorage.removeItem(STARS_KEY)
    } catch {
      /* 무시 */
    }
  },

  /** 하늘 전체를 한 번에 새로 쓴다 (첫 방문 예시 심기 · 좌표 규칙 변경 시 재배치) */
  async replaceAll(stars) {
    writeAll(stars)
    return stars
  },
}

/* ---------------------------------------------------------------
   서버 저장으로 넘어갈 때 — 이 아래만 바꾸면 됩니다.

   import { createClient } from '@supabase/supabase-js'
   const sb = createClient(import.meta.env.VITE_SUPABASE_URL,
                           import.meta.env.VITE_SUPABASE_ANON_KEY)

   export const storage = {
     async listStars() {
       const { data } = await sb.from('stars').select('*').order('created_at')
       return data
     },
     async createStar(star) {
       const { data } = await sb.from('stars').insert(star).select().single()
       return data
     },
     async updateStar(id, patch) {
       const { data } = await sb.from('stars').update(patch).eq('id', id).select().single()
       return data
     },
     async clearAll() {
       await sb.from('stars').delete().eq('author_id', currentUser().id)
     },
   }

   호출하는 쪽(useJanbyeol.js)은 한 줄도 바뀌지 않습니다.
   테이블만 이 모양으로 만들어 두면 됩니다:

     create table stars (
       id          text primary key,
       author_id   text not null,
       author_name text,
       text        text not null,
       tags        text[] not null default '{}',
       photo       text,               -- 업로드한 사진 (또는 스토리지 URL)
       photo_seed  int,                -- 예시용 생성 이미지 씨앗
       created_at  timestamptz not null default now(),
       pos         jsonb not null,     -- {x, y, z} — 한 번 정해지면 안 바뀜
       warmth      int  not null default 0,
       warmed_by   text[] not null default '{}',
       replies     jsonb not null default '[]'
     );
--------------------------------------------------------------- */
