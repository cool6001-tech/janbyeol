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
import { distance, distanceToFit, cosmosDistance } from './lib/geometry.js'
import { GALAXY_RADIUS } from './lib/galaxy.js'

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

/**
 * 잔별을 누르면 그 별로 **다가갑니다.**
 *
 * 연결된 잔별은 은하 반대편에 있습니다(대개 1,700~2,300 단위 — 은하 반지름이
 * 1,650이니 거의 건너편이죠). 그래서 '내 별을 크게 보기'와 '연결된 별을 함께 보기'는
 * 좌표를 그대로 둔 채로는 동시에 성립하지 않습니다.
 *
 * 택한 답: 닿아 있는 잔별을 **잠시** 그 별 곁의 궤도로 끌어옵니다.
 * 이미 '공감 성단'에서 쓰던 연출과 같은 규칙이고, 저장된 좌표는 건드리지 않습니다.
 * 전체 은하로 돌아가면 각자의 자리로 흩어집니다.
 */
const ORBIT_R1 = 230 // 1겹 — 직접 닿은 잔별
const ORBIT_R2 = 430 // 2겹 — 그 잔별이 닿은 잔별

export default function App() {
  const { me, stars, ready, addStar, toggleWarm, addReply, reset } = useJanbyeol()

  const [selectedId, setSelectedId] = useState(null)
  const [cardOpen, setCardOpen] = useState(false) // 카드를 닫아도 줌인은 남는다
  const [mineMode, setMineMode] = useState(false) // 나의 성단 시점인가
  const [kindred, setKindred] = useState({ anchorId: null, ids: [] })
  const [focus, setFocus] = useState(null)
  const [ripple, setRipple] = useState(null)
  const [toast, setToast] = useState('')
  const [welcomeGone, setWelcomeGone] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 860)
  const [panelOpen, setPanelOpen] = useState(true) // 모바일 바텀시트가 펼쳐져 있는가
  const toastTimer = useRef(0)
  const cardAnchorRef = useRef(null)
  // 창 크기가 바뀌었을 때 "지금 무엇을 보고 있었는지"를 리스너에서 읽기 위한 것
  const selectedIdRef = useRef(null)
  const mineModeRef = useRef(false)
  selectedIdRef.current = selectedId
  mineModeRef.current = mineMode

  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  const selected = stars.find((s) => s.id === selectedId) || null
  const constellation = useMemo(() => myConstellation(stars, me.id), [stars, me.id])

  /** 은하 전체가 담기는 거리 — 화면 크기에 따라 달라집니다 */
  const wholeGalaxy = useCallback(
    () =>
      cosmosDistance(GALAXY_RADIUS, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    []
  )

  useEffect(() => {
    let timer = 0
    const onResize = () => {
      setIsNarrow(window.innerWidth <= 860)
      // 화면이 바뀌면 전체 은하 시점은 다시 맞춘다 (회전 · 창 크기 조절)
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (selectedIdRef.current || mineModeRef.current) return
        setFocus({
          pos: { x: 0, y: 0, z: 0 },
          dist: wholeGalaxy(),
          pitch: 0.92,
          hold: 0,
          key: Date.now(),
        })
      }, 220)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(timer)
    }
  }, [wholeGalaxy])

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
    if (kindred.anchorId) {
      for (const id of kindred.ids) {
        out.push({ a: kindred.anchorId, b: id, w: 2, kind: 'bond', cluster: true })
      }
    }
    return out
  }, [graph, ownThreads, kindred])

  /** 누른 잔별에서 별빛이 몇 겹으로 번져나가는지 */
  const trace = useMemo(
    () => (selectedId ? traceFrom(graph.adj, selectedId, TRACE_DEPTH) : null),
    [graph, selectedId]
  )
  const reach = useMemo(() => reachOf(trace, stars), [trace, stars])

  /**
   * 지금 어느 별 곁으로 무엇을 끌어올 것인가.
   * 잔별을 고르면 그 별의 1겹·2겹이 궤도로 모이고, 방금 띄운 직후라면
   * 닮은 마음들(공감 성단)이 모입니다.
   */
  const gather = useMemo(() => {
    if (selectedId && trace) {
      const ring1 = []
      const ring2 = []
      for (const [id, depth] of trace.depthOf) {
        if (depth === 1) ring1.push(id)
        else if (depth === 2) ring2.push(id)
      }
      if (ring1.length || ring2.length) {
        return { anchorId: selectedId, ring1, ring2, r1: ORBIT_R1, r2: ORBIT_R2 }
      }
      return { anchorId: null, ring1: [], ring2: [], r1: ORBIT_R1, r2: ORBIT_R2 }
    }
    if (kindred.anchorId) {
      return { anchorId: kindred.anchorId, ring1: kindred.ids, ring2: [], r1: ORBIT_R1, r2: ORBIT_R2 }
    }
    return { anchorId: null, ring1: [], ring2: [], r1: ORBIT_R1, r2: ORBIT_R2 }
  }, [selectedId, trace, kindred])

  const showCard = Boolean(selected && cardOpen)
  /** 회고 시트를 접어둔 채 하늘을 보고 있는 상태 — 입력창은 그 손잡이 위로 */
  const barOnly = isNarrow && mineMode && !panelOpen && !showCard

  /**
   * 위아래에서 화면을 가리는 UI의 높이.
   * 이만큼 하늘의 중심을 옮겨야 별이 시트나 상단바 뒤에 숨지 않습니다.
   */
  const bottomInset = useMemo(() => {
    if (!isNarrow) return 0
    const h = window.innerHeight
    if (showCard) return Math.min(h * 0.58, 520)
    if (mineMode && panelOpen) return h * 0.7
    if (mineMode) return 176 // 접힌 손잡이 + 그 위의 입력창
    return 84
  }, [isNarrow, showCard, mineMode, panelOpen])

  const topInset = isNarrow ? 58 : 0

  /** 반지름 radius의 무리가 (가려진 곳을 빼고) 화면에 들어오는 카메라 거리 */
  const fitDistance = useCallback(
    (radius) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const narrow = w <= 860
      const usableW = narrow ? w - 32 : w - 420 // 데스크톱은 카드가 한쪽을 차지한다
      const usableH = narrow ? h - bottomInset - 90 : h - 150
      const margin = Math.max(110, Math.min(usableW, usableH) * 0.45)
      return Math.max(340, Math.min(4600, distanceToFit(radius, margin)))
    },
    [bottomInset]
  )

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
   * 잔별을 누르면 그 별이 화면의 중심이 되고, 닿아 있는 잔별들이 곁으로 모여듭니다.
   * 카드는 그 별 옆에 떠서, 어느 별의 글인지가 눈으로 이어집니다.
   */
  const handleSelect = useCallback(
    (id) => {
      setWelcomeGone(true)

      if (!id) {
        setSelectedId(null)
        setCardOpen(false)
        return
      }

      const star = stars.find((s) => s.id === id)
      if (!star) return

      // 이미 고른 별을 다시 누르면 카메라는 그대로 두고 카드만 다시 연다
      if (id === selectedId) {
        setCardOpen(true)
        return
      }

      setSelectedId(id)
      setCardOpen(true)
      setKindred({ anchorId: null, ids: [] })
      if (isNarrow) setPanelOpen(false)

      const reached = traceFrom(graph.adj, id, TRACE_DEPTH)
      let outer = 0
      for (const depth of reached.depthOf.values()) {
        if (depth === 1) outer = Math.max(outer, ORBIT_R1)
        else if (depth === 2) outer = Math.max(outer, ORBIT_R2)
      }

      setFocus({
        pos: star.pos, // 고른 별이 곧 화면의 중심
        dist: outer ? fitDistance(outer * 1.08) : 420,
        pitch: 0.82,
        hold: 14000,
        key: Date.now() + Math.random(),
      })
    },
    [stars, selectedId, graph, isNarrow, fitDistance]
  )

  /** 카드를 닫아도 줌인·궤도·연결은 그대로 남는다 */
  const closeCard = useCallback(() => setCardOpen(false), [])

  /* ---------- 시점 전환 ---------- */

  /** 나의 성단으로 — 내 잔별들의 무게중심으로 카메라가 내려앉는다 */
  const enterMine = useCallback(() => {
    setWelcomeGone(true)
    setMineMode(true)
    // 좁은 화면에서는 손잡이만 남기고 접어 둔다 — 먼저 보여야 할 건 하늘이니까
    setPanelOpen(window.innerWidth > 860)
    setSelectedId(null)
    setCardOpen(false)
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
    const spread = Math.max(60, ...mine.map((s) => distance(s.pos, centroid)))
    setFocus({
      pos: centroid,
      dist: fitDistance(spread * 1.25),
      pitch: 0.72,
      hold: 9000,
      key: Date.now(),
    })
    say('내가 띄운 잔별만 밝혀 두었어요 — 별 하나를 눌러보세요')
  }, [constellation, say, fitDistance])

  /** 전체 은하로 — 모두의 잔별이 다시 떠오르고 카메라가 제자리로 */
  const backToCosmos = useCallback(() => {
    setSelectedId(null)
    setCardOpen(false)
    setMineMode(false)
    setKindred({ anchorId: null, ids: [] })
    setFocus({ pos: { x: 0, y: 0, z: 0 }, dist: wholeGalaxy(), pitch: 0.92, hold: 0, key: Date.now() })
    setWelcomeGone(true)
  }, [wholeGalaxy])

  const toggleMine = useCallback(() => {
    if (mineMode) backToCosmos()
    else enterMine()
  }, [mineMode, backToCosmos, enterMine])

  /* ---------- 잔별 ---------- */

  const handleCreate = useCallback(
    async ({ text, photo }) => {
      setWelcomeGone(true)
      setMineMode(false)
      setSelectedId(null)
      setCardOpen(false)
      const star = await addStar({ text, photo })
      const similar = findKindred(stars, star, 5)
      setKindred({ anchorId: star.id, ids: similar.map((s) => s.id) })
      lookAt(star, { scale: 1, dist: fitDistance(ORBIT_R1 * 1.15), pitch: 0.7, hold: 5200 })
      say('잔별이 떠올랐어요. 닮은 마음들이 모여듭니다.')
      setTimeout(() => {
        setSelectedId(star.id)
        setCardOpen(true)
      }, 950)
    },
    [addStar, stars, lookAt, say, fitDistance]
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

  // 좁은 화면에서는 카드와 회고 패널이 같은 자리를 쓰므로 한 번에 하나만 펼친다
  const panelVisible = mineMode && !(isNarrow && showCard)

  return (
    <>
      <Galaxy
        stars={stars}
        links={links}
        selectedId={selectedId}
        gather={gather}
        focus={focus}
        ripple={ripple}
        trace={trace}
        myId={me.id}
        mineMode={mineMode}
        onSelect={handleSelect}
        reducedMotion={reducedMotion}
        cardAnchorRef={cardAnchorRef}
        cardOpen={showCard}
        anchored={!isNarrow}
        bottomInset={bottomInset}
        topInset={topInset}
        initialDist={wholeGalaxy()}
      />

      {/* 좁은 화면에서 시트가 올라오면 입력창은 자리를 비켜준다 */}
      <div
        className={`ui${isNarrow && (showCard || (mineMode && panelOpen)) ? ' cardup' : ''}${
          barOnly ? ' liftbottom' : ''
        }`}
      >
        <TopBar
          clusterCount={kindred.ids.length}
          mineMode={mineMode}
          onToggleMine={toggleMine}
          onCosmos={backToCosmos}
        />

        {!welcomeGone && ready && <Welcome gone={welcomeGone} />}

        <div className="bottom">
          <p className="creed">
            별거 아닌 줄 알았던 당신의 오늘이, 이곳에선 누군가의 밤을 비추는 잔별이 됩니다.
          </p>
          <Composer onSubmit={handleCreate} onFocus={() => setWelcomeGone(true)} compact={isNarrow} />
        </div>
      </div>

      {/* 카드는 고른 별 옆에 뜹니다. 좌표는 Galaxy가 매 프레임 직접 써넣습니다. */}
      <div className={`cardwrap${showCard ? ' on' : ''}`} ref={cardAnchorRef} aria-hidden={!showCard}>
        {selected && (
          <StarCard
            star={selected}
            me={me}
            reach={reach}
            open={showCard}
            onWarm={handleWarm}
            onReply={handleReply}
            onClose={closeCard}
          />
        )}
      </div>

      {panelVisible && (
        <ConstellationPanel
          data={constellation}
          sheet={isNarrow}
          open={!isNarrow || panelOpen}
          onToggle={() => setPanelOpen((v) => !v)}
          onClose={backToCosmos}
          onSelectStar={handleSelect}
          onReset={() => {
            reset()
            setSelectedId(null)
            setCardOpen(false)
            setKindred({ anchorId: null, ids: [] })
            setMineMode(false)
            say('하늘을 처음 상태로 되돌렸어요')
          }}
        />
      )}

      <Toast message={toast} />
    </>
  )
}
