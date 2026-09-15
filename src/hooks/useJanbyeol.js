import { useCallback, useEffect, useMemo, useState } from 'react'
import { storage, readLog, currentUser } from '../lib/storage.js'
import { buildSeed } from '../data/seed.js'
import { tagsOf } from '../lib/tags.js'
import { galaxyPositionFor } from '../lib/galaxy.js'

/** 좌표 배치 규칙의 판. 규칙이 바뀌면 올려서 옛 기록을 새 은하로 옮깁니다. */
const POS_VERSION = 3

/**
 * 잔별의 상태를 한 곳에서 관리합니다.
 * 화면 컴포넌트들은 저장소를 직접 건드리지 않고 이 훅만 씁니다.
 */
export function useJanbyeol() {
  const me = useMemo(() => currentUser(), [])
  const [stars, setStars] = useState([])
  const [ready, setReady] = useState(false)
  const [read, setRead] = useState([]) // 읽은 순서대로 — 별길의 재료

  // 첫 방문이면 예시 잔별을 한 번 심고, 아니면 저장된 하늘을 그대로 불러온다
  useEffect(() => {
    let alive = true
    ;(async () => {
      let list = await storage.listStars()
      if (!list) {
        list = buildSeed(me)
        await storage.replaceAll(list)
      } else if (list.some((s) => s.posV !== POS_VERSION)) {
        // 예전 좌표로 저장된 잔별을 나선 팔 위로 옮긴다 (글은 그대로)
        list = list.map((s) =>
          s.posV === POS_VERSION ? s : { ...s, pos: galaxyPositionFor(s), posV: POS_VERSION }
        )
        await storage.replaceAll(list)
      }
      const log = await readLog.list()
      if (alive) {
        setStars(list)
        setRead(log)
        setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [me])

  /** 잔별 띄우기 — 좌표는 이때 확정되어 함께 저장됩니다 */
  const addStar = useCallback(
    async ({ text, photo }) => {
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
      }
      // 새 잔별은 내 성단의 바깥 — 별이 태어나는 자리에 자리 잡는다
      const star = { ...draft, pos: galaxyPositionFor(draft) }
      await storage.createStar(star)
      setStars((prev) => [...prev, star])
      return star
    },
    [me]
  )

  /** 온기 더하기 / 거두기 */
  const toggleWarm = useCallback(
    async (id) => {
      const target = stars.find((s) => s.id === id)
      if (!target) return
      const already = (target.warmedBy || []).includes(me.id)
      const warmedBy = already
        ? target.warmedBy.filter((u) => u !== me.id)
        : [...(target.warmedBy || []), me.id]
      const patch = { warmedBy, warmth: Math.max(0, (target.warmth || 0) + (already ? -1 : 1)) }
      setStars((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
      await storage.updateStar(id, patch)
    },
    [stars, me]
  )

  /** 별빛 이어가기 */
  const addReply = useCallback(
    async (id, text) => {
      const target = stars.find((s) => s.id === id)
      if (!target) return
      const reply = {
        id: `r-${Date.now().toString(36)}`,
        who: me.name,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      }
      const replies = [...(target.replies || []), reply]
      setStars((prev) => prev.map((s) => (s.id === id ? { ...s, replies } : s)))
      await storage.updateStar(id, { replies })
    },
    [stars, me]
  )

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

  /** 하늘을 처음 상태로 (예시 기록까지 전부 지움) */
  const reset = useCallback(async () => {
    await storage.clearAll()
    const list = buildSeed(me)
    await storage.replaceAll(list)
    // 별 id가 새로 생기므로 옛 별길은 가리킬 곳이 없습니다
    setRead(await readLog.clear())
    setStars(list)
  }, [me])

  return {
    me,
    stars,
    ready,
    addStar,
    toggleWarm,
    addReply,
    reset,
    read,
    readMap,
    markRead,
    clearRead,
  }
}
