import { useCallback, useEffect, useMemo, useState } from 'react'
import { storage, readLog, currentUser, ensureUser, onAuthChange } from '../lib/storage.js'
import { isConfigured } from '../lib/supabase.js'
import { tagsOf } from '../lib/tags.js'
import { galaxyPositionFor } from '../lib/galaxy.js'

/** 좌표 배치 규칙의 판. 규칙이 바뀌면 올려서 옛 기록을 새 은하로 옮깁니다. */
const POS_VERSION = 3

/**
 * 잔별의 상태를 한 곳에서 관리합니다.
 * 화면 컴포넌트들은 저장소를 직접 건드리지 않고 이 훅만 씁니다.
 *
 * 서버로 옮기면서 달라진 점 하나 — 이제 하늘은 **모두의 것**입니다.
 * 예전엔 첫 방문 때 예시를 심었지만, 이제 서버에 이미 별이 있습니다.
 * (처음 한 번은 scripts/seed-server.mjs 로 하늘을 채웁니다.)
 */
export function useJanbyeol() {
  const [me, setMe] = useState(() => currentUser())
  const [stars, setStars] = useState([])
  const [ready, setReady] = useState(false)
  const [read, setRead] = useState([]) // 읽은 순서대로 — 별길의 재료
  const [trouble, setTrouble] = useState(false) // 하늘에 닿지 못했는가

  // 익명 계정을 받아오고 → 하늘을 불러온다
  useEffect(() => {
    let alive = true
    ;(async () => {
      const user = await ensureUser()
      if (!alive) return
      setMe(user)

      let list = []
      try {
        if (!isConfigured) throw new Error('환경변수가 설정되지 않았습니다')
        list = await storage.listStars()
      } catch (err) {
        // 빈 하늘로 보이게 두지 않습니다 — 별이 없는 것과 못 불러온 것은 다릅니다
        console.error('[잔별] 하늘을 불러오지 못했습니다.', err)
        if (alive) setTrouble(true)
      }
      const log = await readLog.list()
      if (!alive) return

      // 좌표 규칙이 바뀌었으면 화면에서만 다시 계산합니다.
      // (남의 별을 내가 서버에 고쳐 쓸 수는 없으니까요 — 그래야 맞습니다)
      const placed = list.map((s) =>
        s.pos && s.posV === POS_VERSION ? s : { ...s, pos: galaxyPositionFor(s), posV: POS_VERSION }
      )

      setStars(placed)
      setRead(log)
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // '내 성단 지키기'로 카카오를 연결하고 돌아오면 같은 사람인 채로 갱신됩니다
  useEffect(() => onAuthChange((user) => setMe(user)), [])

  /** 잔별 띄우기 — 좌표는 이때 확정되어 함께 저장됩니다 */
  const addStar = useCallback(
    async ({ text, photo, allowFeature = false }) => {
      const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const draft = {
        id,
        authorId: me.id,
        authorName: me.name,
        text: text.trim(),
        tags: tagsOf(text),
        photo: photo || null,
        photoSeed: null,
        createdAt: new Date().toISOString(),
        posV: POS_VERSION,
        warmth: 0,
        warmedBy: [],
        replies: [],
        seeded: false,
        allowFeature, // 글쓴이가 직접 체크했을 때만 true
      }
      // 새 잔별은 내 성단의 바깥 — 별이 태어나는 자리에 자리 잡는다
      const star = { ...draft, pos: galaxyPositionFor(draft) }

      // 화면에는 바로 띄우고, 서버 응답을 기다리지 않습니다.
      // 네트워크가 느리다고 별이 늦게 뜨면 "띄웠다"는 감각이 깨집니다.
      setStars((prev) => [...prev, star])
      try {
        await storage.createStar(star)
      } catch (err) {
        console.error('[잔별] 저장하지 못했습니다.', err)
        setStars((prev) => prev.filter((s) => s.id !== id))
        throw err
      }
      return star
    },
    [me]
  )

  /** 온기 더하기 / 거두기 */
  const toggleWarm = useCallback(
    async (id) => {
      const target = stars.find((s) => s.id === id)
      if (!target || !me.id) return
      const already = (target.warmedBy || []).includes(me.id)

      // 먼저 화면부터 — 누른 순간 따뜻해져야 합니다
      const optimistic = {
        warmedBy: already ? [] : [me.id],
        warmth: Math.max(0, (target.warmth || 0) + (already ? -1 : 1)),
      }
      setStars((prev) => prev.map((s) => (s.id === id ? { ...s, ...optimistic } : s)))

      try {
        // 서버가 세어준 진짜 숫자로 맞춥니다 (다른 사람이 동시에 눌렀을 수도 있으니)
        const warmth = await storage.warm(id, !already)
        setStars((prev) => prev.map((s) => (s.id === id ? { ...s, warmth } : s)))
      } catch (err) {
        console.error('[잔별] 온기를 전하지 못했습니다.', err)
        setStars((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, warmedBy: target.warmedBy || [], warmth: target.warmth || 0 }
              : s
          )
        )
      }
    },
    [stars, me]
  )

  /** 별빛 이어가기 */
  const addReply = useCallback(
    async (id, text) => {
      const target = stars.find((s) => s.id === id)
      if (!target) return
      try {
        const reply = await storage.addReply(id, text)
        setStars((prev) =>
          prev.map((s) => (s.id === id ? { ...s, replies: [...(s.replies || []), reply] } : s))
        )
      } catch (err) {
        console.error('[잔별] 별빛을 잇지 못했습니다.', err)
      }
    },
    [stars]
  )

  /* ---------------- 지키는 일 ---------------- */

  /** 소개 동의 바꾸기 — 나의 성단에서 언제든 거둘 수 있어야 합니다 */
  const setAllowFeature = useCallback(async (starId, on) => {
    setStars((prev) => prev.map((s) => (s.id === starId ? { ...s, allowFeature: on } : s)))
    try {
      await storage.setAllowFeature(starId, on)
    } catch (err) {
      console.error('[잔별] 소개 동의를 바꾸지 못했습니다.', err)
      setStars((prev) => prev.map((s) => (s.id === starId ? { ...s, allowFeature: !on } : s)))
    }
  }, [])

  /** 신고 — 쌓이면 서버가 알아서 가립니다 */
  const report = useCallback(async (starId, reason) => {
    await storage.report({ starId }, reason)
    // 신고한 사람 눈앞에서는 바로 사라지는 게 맞습니다
    setStars((prev) => prev.filter((s) => s.id !== starId))
  }, [])

  /** 차단 — 이 사람의 별은 내 하늘에서 전부 사라집니다 */
  const block = useCallback(async (userId) => {
    await storage.block(userId)
    setStars((prev) => prev.filter((s) => s.authorId !== userId))
  }, [])

  /* ---------------- 별길 ---------------- */

  /** 이 잔별을 읽었다 — 별길이 한 칸 자란다 */
  const markRead = useCallback(async (id) => {
    const next = await readLog.add(id)
    setRead(next)
  }, [])

  /** 별길만 지운다 (띄운 잔별은 그대로) */
  const clearRead = useCallback(async () => {
    setRead(await readLog.clear())
  }, [])

  /** 언제 읽었는지 — 카드에서 '전에 읽은 잔별'을 알려줄 때 씁니다 */
  const readMap = useMemo(() => new Map(read.map((r) => [r.id, r])), [read])

  /** 내가 띄운 별을 전부 거둡니다 (남의 별은 그대로 하늘에 남습니다) */
  const reset = useCallback(async () => {
    await storage.clearAll()
    setStars((prev) => prev.filter((s) => s.authorId !== me.id))
    setRead(await readLog.clear())
  }, [me])

  return {
    me,
    stars,
    ready,
    trouble,
    addStar,
    toggleWarm,
    addReply,
    report,
    block,
    setAllowFeature,
    reset,
    read,
    readMap,
    markRead,
    clearRead,
  }
}
