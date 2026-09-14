import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Galaxy from './components/Galaxy.jsx'
import StarCard from './components/StarCard.jsx'
import Composer from './components/Composer.jsx'
import TopBar from './components/TopBar.jsx'
import Welcome from './components/Welcome.jsx'
import Toast from './components/Toast.jsx'
import ConstellationPanel from './components/ConstellationPanel.jsx'
import { useJanbyeol } from './hooks/useJanbyeol.js'
import { myConstellation, findKindred } from './lib/stats.js'
import { buildGraph, buildOwnThreads, traceFrom, reachOf } from './lib/graph.js'
import { distance } from './lib/geometry.js'

/**
 * 하늘을 보는 두 가지 시점
 * ---------------------------------------------------------------
 *  전체 은하  — 모두의 잔별이 함께 떠 있는 기본 상태
 *  나의 성단  — 내가 띄운 잔별만 밝히고 나머지는 배경으로 저무는 상태
 *
 * 둘은 같은 우주를 다르게 보는 것이지, 다른 화면이 아닙니다.
 * 그래서 '나의 성단'은 패널만 여는 버튼이 아니라 시점을 바꾸는 버튼입니다.
 */
/** 별빛이 몇 겹까지 번져나가는지 */
const TRACE_DEPTH = 4

export default function App() {
  const { me, stars, ready, addStar, toggleWarm, addReply, reset } = useJanbyeol()

  const [selectedId, setSelectedId] = useState(null)
  const [mineMode, setMineMode] = useState(false) // 나의 성단 시점인가
  const [cluster, setCluster] = useState({ anchorId: null, ids: [] })
  const [focus, setFocus] = useState(null)
  const [ripple, setRipple] = useState(null)
  const [toast, setToast] = useState('')
  const [welcomeGone, setWelcomeGone] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 860)
  const toastTimer = useRef(0)

  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  const selected = stars.find((s) => s.id === selectedId) || null
  const constellation = useMemo(() => myConstellation(stars, me.id), [stars, me.id])

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 860)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* 웰컴 문구는 첫 조작이나 7초 뒤에 저문다 */
  useEffect(() => {
    const t = setTimeout(() => setWelcomeGone(true), 7000)
    return () => clearTimeout(t)
  }, [])

  const say = useCallback((message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])

  /**
   * 선은 두 겹입니다.
   *   앞 — 이야기의 줄기: 같은 사람의 잔별을 띄운 순서대로 이은 실
   *   뒤 — 공감의 그물: 은하를 가로질러 다른 사람의 잔별에 닿는 선
   * 내 성단은 한 줄기로 또렷하고, 그 뒤로 낯선 이들과의 연결이 희미하게 비칩니다.
   */
  const graph = useMemo(() => buildGraph(stars, 4), [stars])
  const ownThreads = useMemo(() => buildOwnThreads(stars), [stars])

  const links = useMemo(() => {
    const out = [
      ...graph.edges.map((e) => ({ a: e.a, b: e.b, w: e.w, kind: 'bond' })),
      ...ownThreads,
    ]
    if (cluster.anchorId) {
      for (const id of cluster.ids) {
        out.push({ a: cluster.anchorId, b: id, w: 2, kind: 'bond', cluster: true })
      }
    }
    return out
  }, [graph, ownThreads, cluster])

  /** 누른 잔별에서 별빛이 몇 겹으로 번져나가는지 */
  const trace = useMemo(
    () => (selectedId ? traceFrom(graph.adj, selectedId, TRACE_DEPTH) : null),
    [graph, selectedId]
  )
  const reach = useMemo(() => reachOf(trace, stars), [trace, stars])

  const lookAt = useCallback((star, options = {}) => {
    if (!star) return
    const scale = options.scale ?? 0.6
    setFocus({
      pos: { x: star.pos.x * scale, y: star.pos.y * scale, z: star.pos.z * scale },
      dist: options.dist,
      pitch: options.pitch,
      hold: options.hold,
      key: Date.now() + Math.random(),
    })
  }, [])

  /**
   * 잔별을 누르면 카메라가 오히려 **물러납니다.**
   * 이 마음이 어디까지 닿아 있는지 — 은하 건너편까지 이어진 실이 한 화면에
   * 들어와야 하니까요. 다가가는 게 아니라 시야를 넓히는 동작입니다.
   */
  const handleSelect = useCallback(
    (id) => {
      setWelcomeGone(true)
      setSelectedId(id)
      if (!id) return
      const star = stars.find((s) => s.id === id)
      if (!star) return

      const reached = traceFrom(graph.adj, id, TRACE_DEPTH)
      const nodes = [...reached.depthOf.keys()]
        .map((nid) => stars.find((s) => s.id === nid))
        .filter(Boolean)

      if (nodes.length <= 1) {
        lookAt(star, { scale: 1, dist: 520, hold: 7000 })
        return
      }

      const sum = nodes.reduce(
        (acc, s) => ({ x: acc.x + s.pos.x, y: acc.y + s.pos.y, z: acc.z + s.pos.z }),
        { x: 0, y: 0, z: 0 }
      )
      const mid = { x: sum.x / nodes.length, y: sum.y / nodes.length, z: sum.z / nodes.length }
      // 누른 잔별 쪽에 조금 더 무게를 둔다 — 이야기의 출발점이니까
      const target = {
        x: star.pos.x * 0.42 + mid.x * 0.58,
        y: star.pos.y * 0.42 + mid.y * 0.58,
        z: star.pos.z * 0.42 + mid.z * 0.58,
      }
      const far = Math.max(...nodes.map((s) => distance(s.pos, target)))
      setFocus({
        pos: target,
        dist: Math.max(520, Math.min(4200, far * 2.4 + 320)),
        hold: 10000,
        key: Date.now() + Math.random(),
      })
    },
    [stars, graph, lookAt]
  )

  /* ---------- 시점 전환 ---------- */

  /** 나의 성단으로 — 내 잔별들의 무게중심으로 카메라가 내려앉는다 */
  const enterMine = useCallback(() => {
    setWelcomeGone(true)
    setMineMode(true)
    const mine = constellation.mine
    if (mine.length === 0) {
      say('아직 띄운 잔별이 없어요. 오늘의 한 줄을 남겨보세요.')
      return
    }
    const sum = mine.reduce(
      (a, s) => ({ x: a.x + s.pos.x, y: a.y + s.pos.y, z: a.z + s.pos.z }),
      { x: 0, y: 0, z: 0 }
    )
    const centroid = { x: sum.x / mine.length, y: sum.y / mine.length, z: sum.z / mine.length }
    const spread = Math.max(...mine.map((s) => distance(s.pos, centroid)))
    setFocus({
      pos: centroid,
      dist: Math.max(300, Math.min(3800, spread * 2.4 + 260)),
      pitch: 0.72,
      hold: 9000,
      key: Date.now(),
    })
    say('내가 띄운 잔별만 밝혀 두었어요')
  }, [constellation, say])

  /** 전체 은하로 — 모두의 잔별이 다시 떠오르고 카메라가 제자리로 */
  const backToCosmos = useCallback(() => {
    setSelectedId(null)
    setMineMode(false)
    setCluster({ anchorId: null, ids: [] })
    setFocus({ pos: { x: 0, y: 0, z: 0 }, dist: 3400, pitch: 0.92, hold: 0, key: Date.now() })
    setWelcomeGone(true)
  }, [])

  const toggleMine = useCallback(() => {
    if (mineMode) backToCosmos()
    else enterMine()
  }, [mineMode, backToCosmos, enterMine])

  /* ---------- 잔별 ---------- */

  const handleCreate = useCallback(
    async ({ text, photo }) => {
      setWelcomeGone(true)
      setMineMode(false)
      const star = await addStar({ text, photo })
      const kindred = findKindred(stars, star, 5)
      setCluster({ anchorId: star.id, ids: kindred.map((s) => s.id) })
      lookAt(star, { scale: 1, dist: 460, pitch: 0.62, hold: 5200 })
      say('잔별이 떠올랐어요. 닮은 마음들이 모여듭니다.')
      setTimeout(() => setSelectedId(star.id), 950)
    },
    [addStar, stars, lookAt, say]
  )

  const handleWarm = useCallback(
    (id) => {
      const star = stars.find((s) => s.id === id)
      const already = (star?.warmedBy || []).includes(me.id)
      toggleWarm(id)
      if (!already) {
        setRipple({ id, key: Date.now() })
        say('별빛이 조금 더 따뜻해졌어요')
      }
    },
    [stars, me.id, toggleWarm, say]
  )

  const handleReply = useCallback(
    (id, text) => {
      addReply(id, text)
      setRipple({ id, key: Date.now() })
      say('별빛을 이어 보냈어요')
    },
    [addReply, say]
  )

  // 좁은 화면에서는 카드와 패널이 같은 자리를 쓰므로 한 번에 하나만 보인다
  const panelVisible = mineMode && !(isNarrow && selected)

  return (
    <>
      <Galaxy
        stars={stars}
        links={links}
        selectedId={selectedId}
        clusterIds={cluster.ids}
        clusterAnchorId={cluster.anchorId}
        focus={focus}
        ripple={ripple}
        trace={trace}
        myId={me.id}
        mineMode={mineMode}
        onSelect={handleSelect}
        reducedMotion={reducedMotion}
      />

      <div className="ui">
        <TopBar
          clusterCount={cluster.ids.length}
          mineMode={mineMode}
          onToggleMine={toggleMine}
          onCosmos={backToCosmos}
        />

        {!welcomeGone && ready && <Welcome gone={welcomeGone} />}

        <div className="bottom">
          <p className="creed">
            별거 아닌 줄 알았던 당신의 오늘이, 이곳에선 누군가의 밤을 비추는 잔별이 됩니다.
          </p>
          <Composer onSubmit={handleCreate} onFocus={() => setWelcomeGone(true)} />
        </div>
      </div>

      {selected && (
        <StarCard
          star={selected}
          me={me}
          reach={reach}
          onWarm={handleWarm}
          onReply={handleReply}
          onClose={() => setSelectedId(null)}
        />
      )}

      {panelVisible && (
        <ConstellationPanel
          data={constellation}
          onClose={backToCosmos}
          onSelectStar={handleSelect}
          onReset={() => {
            reset()
            setSelectedId(null)
            setCluster({ anchorId: null, ids: [] })
            setMineMode(false)
            say('하늘을 처음 상태로 되돌렸어요')
          }}
        />
      )}

      <Toast message={toast} />
    </>
  )
}
