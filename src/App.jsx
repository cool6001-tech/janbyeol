import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Galaxy from './components/Galaxy.jsx'
import StarCard from './components/StarCard.jsx'
import Composer from './components/Composer.jsx'
import TopBar from './components/TopBar.jsx'
import Welcome from './components/Welcome.jsx'
import Toast from './components/Toast.jsx'
import ConstellationPanel from './components/ConstellationPanel.jsx'
import Tutorial from './components/Tutorial.jsx'
import IntroVideo from './components/IntroVideo.jsx'
import TermsNotice from './components/TermsNotice.jsx'
import { ContactSheet } from './components/Contact.jsx'
import { useJanbyeol } from './hooks/useJanbyeol.js'
import { myConstellation, findKindred, shiningStars } from './lib/stats.js'
import { buildGraph, traceFrom, reachOf } from './lib/graph.js'
import { distance, distanceToFit, cosmosDistance, FOCAL } from './lib/geometry.js'
import { GALAXY_RADIUS } from './lib/galaxy.js'
import { onboarding, takeAuthNotice } from './lib/storage.js'

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
 *
 * 그리고 **얼마나 닮았느냐가 곧 거리입니다.** 1겹 안에서도 10점짜리는
 * 코앞에(ORBIT_NEAR), 3점짜리는 그 바깥에(ORBIT_FAR) 섭니다.
 * 점수는 화면에 숫자로 나오지 않아요 — 거리로만 말합니다.
 */
const ORBIT_NEAR = 320 // 10점 — 나와 가장 가까운 마음
const ORBIT_FAR = 520 // 겨우 이어진 정도
const ORBIT_R2 = 820 // 2겹 — 그 잔별이 닿은 잔별 (넓은 화면에서만)

/**
 * 고른 별 둘레에 비워 두는 간격.
 *
 * 같은 사람의 잔별은 성단 반지름(105) 안에 모여 있습니다. 궤도가 155에서
 * 시작하던 때는 이 형제들이 고른 별 위에 포개져서, 어느 별을 고른 건지조차
 * 알아보기 어려웠어요. 끌어오지 않는 별이라도 이만큼은 밀어냅니다.
 */
const ANCHOR_CLEAR = 240

/** 넓은 화면에서 좌우를 가리는 것들의 너비 — 이만큼 하늘이 비켜섭니다 */
const CARD_DOCK = 532 // 오른쪽 잔별 카드 (넓은 화면 492px + 여백)
const PANEL_DOCK = 462 // 왼쪽 나의 성단 패널 (넓은 화면 430px + 여백)

/** 내 잔별 곁으로 모여드는 닮은 별의 수 */
const KIN_COUNT = 5

/** 점수(0~10)를 궤도 반지름으로 */
function orbitRadiusFor(score) {
  const t = Math.max(0, Math.min(1, score / 10))
  return ORBIT_FAR - (ORBIT_FAR - ORBIT_NEAR) * t
}

/**
 * 첫 안내를 보여줄까.
 * 한 번도 끝까지 보지(또는 건너뛰지) 않은 사람에게만 뜹니다.
 * 주소 끝에 `?tour`를 붙이면 언제든 처음 온 사람처럼 다시 볼 수 있어요.
 */
function shouldTour() {
  try {
    if (new URLSearchParams(window.location.search).has('tour')) return true
  } catch {
    /* 무시 */
  }
  return !onboarding.seen()
}

/**
 * 1분 소개 영상을 보여줄까.
 * 처음 온 사람(안내를 아직 안 본 사람)에게만. `?intro`를 붙이면 언제든 다시 볼 수 있어요.
 */
function shouldIntro() {
  try {
    if (new URLSearchParams(window.location.search).has('intro')) return true
  } catch {
    /* 무시 */
  }
  return shouldTour()
}

/** 안내가 보여줄 '누군가의 별' — 남이 쓴 잔별 중 이야기가 가장 많이 닿아 있는 것 */
function pickDemoStar(stars, graph, myId) {
  let best = null
  let bestScore = -1
  for (const s of stars) {
    if (s.authorId === myId) continue
    const score =
      (graph.adj.get(s.id)?.length || 0) * 2 +
      (s.replies?.length || 0) * 3 +
      (s.photo || s.photoSeed ? 2 : 0) +
      (s.warmth || 0) * 0.1
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return best
}

export default function App() {
  const {
    me,
    stars,
    ready,
    trouble,
    addStar,
    toggleWarm,
    addReply,
    removeStar,
    report,
    block,
    setAllowFeature,
    featurePref,
    setFeaturePref,
    read,
    readMap,
    markRead,
    clearRead,
  } = useJanbyeol()

  const [selectedId, setSelectedId] = useState(null)
  const [cardOpen, setCardOpen] = useState(false) // 카드를 닫아도 줌인은 남는다
  const [mineMode, setMineMode] = useState(false) // 나의 성단 시점인가
  const [kindred, setKindred] = useState({ anchorId: null, ids: [] })
  // 닮은 별 목록에서 남의 별을 열었을 때, 돌아갈 내 잔별
  const [kinOrigin, setKinOrigin] = useState(null)
  const [focus, setFocus] = useState(null)
  const [ripple, setRipple] = useState(null)
  const [toast, setToast] = useState('')
  const [reReading, setReReading] = useState(null) // 이미 읽었던 잔별을 다시 연 경우
  const [welcomeGone, setWelcomeGone] = useState(false)
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 860)
  const [panelOpen, setPanelOpen] = useState(true) // 모바일 바텀시트가 펼쳐져 있는가
  const [tourOpen, setTourOpen] = useState(shouldTour) // 처음 온 사람에게만
  // 처음 온 사람은 1분 소개 영상부터 — 끝나거나 건너뛰면 안내로 이어집니다
  const [introOpen, setIntroOpen] = useState(shouldIntro)
  const [tourStep, setTourStep] = useState(null) // 안내가 지금 보여주는 장면
  const [tourInset, setTourInset] = useState(0) // 안내 카드가 아래를 가리는 높이
  const [contactOpen, setContactOpen] = useState(false) // 만든 사람에게 — 메일 주소 카드
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

  /* 오늘 빛나는 별 — 전체 은하에서만. 몇 번째 별을 보고 있는지 기억합니다 */
  const shining = useMemo(() => shiningStars(stars, 1), [stars])
  const brightest = shining[0] || null
  const [shineOn, setShineOn] = useState(false) // 지금 열린 카드가 '오늘 가장 빛나는 별'로 연 것인가
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
    /* 휴대폰 첫 진입 — 주소창·툴바가 자리를 잡기 전에 잰 화면 크기로 거리를 정하면
       은하가 너무 크게 보입니다. resize 이벤트도 오지 않을 때가 있어서,
       잠깐 뒤에 실제 크기가 처음과 달라졌는지 직접 확인하고 다시 맞춥니다. */
    const first = { w: window.innerWidth, h: window.innerHeight }
    const settle = [250, 700, 1500].map((ms) =>
      setTimeout(() => {
        if (window.innerWidth !== first.w || window.innerHeight !== first.h) {
          first.w = window.innerWidth
          first.h = window.innerHeight
          onResize()
        }
      }, ms)
    )
    return () => {
      settle.forEach(clearTimeout)
      window.removeEventListener('resize', onResize)
      clearTimeout(timer)
    }
  }, [wholeGalaxy])

  /* 웰컴 문구는 첫 조작이나 7초 뒤에 저문다 */
  useEffect(() => {
    const t = setTimeout(() => setWelcomeGone(true), 7000)
    return () => clearTimeout(t)
  }, [])

  const say = useCallback((message, ms = 2400) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), ms)
  }, [])

  /* 카카오/구글로 다른 기기의 성단을 불러온 직후 — 한 번만 알려줍니다 */
  useEffect(() => {
    if (!ready) return
    const notice = takeAuthNotice()
    if (notice) say(notice, 4200)
  }, [ready, me.id, say])

  /* 휴대폰에서 키보드가 닫힌 뒤 화면이 위로 밀린 채 남는 일을 막습니다.
     (iOS 사파리는 입력창을 보이게 하려고 페이지를 올려놓고 되돌리지 않을 때가 있어요.
      그러면 '나의 성단' 버튼이 상태표시줄·다이내믹 아일랜드 밑으로 들어가 눌리지 않습니다) */
  useEffect(() => {
    const onFocusOut = () => {
      setTimeout(() => {
        const el = document.activeElement
        const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
        if (!typing && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0)
      }, 80)
    }
    document.addEventListener('focusout', onFocusOut)
    // 키보드가 닫히며 보이는 영역이 바뀔 때도 한 번 더 제자리로 (아이폰은 scrollY 가 0이어도 밀려 있을 때가 있어요)
    const vv = window.visualViewport
    const onViewport = () => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if ((vv && vv.offsetTop > 0) || window.scrollY) window.scrollTo(0, 0)
    }
    vv?.addEventListener('resize', onViewport)
    vv?.addEventListener('scroll', onViewport)
    return () => {
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', onViewport)
      vv?.removeEventListener('scroll', onViewport)
    }
  }, [])

  /**
   * 선은 두 겹입니다.
   *   앞 — 이야기의 줄기: 같은 사람의 잔별을 띄운 순서대로 이은 실
   *   뒤 — 공감의 그물: 은하를 가로질러 다른 사람의 잔별에 닿는 선
   * 내 성단은 한 줄기로 또렷하고, 그 뒤로 낯선 이들과의 연결이 희미하게 비칩니다.
   */
  const graph = useMemo(() => buildGraph(stars, 4), [stars])

  // 내 잔별끼리 시간 순으로 잇던 '이야기의 줄기'는 그리지 않습니다.
  // 선이 많아 복잡하기만 했고, 내 잔별은 나의 성단 목록에서 볼 수 있으니까요.
  const links = useMemo(() => {
    const out = graph.edges.map((e) => ({ a: e.a, b: e.b, w: e.w, kind: 'bond' }))
    if (kindred.anchorId) {
      for (const id of kindred.ids) {
        out.push({ a: kindred.anchorId, b: id, w: 2, kind: 'bond', cluster: true })
      }
    }
    return out
  }, [graph, kindred])

  /** 누른 잔별에서 별빛이 몇 겹으로 번져나가는지 */
  /** 내 잔별을 열었을 때는 그물을 따라가지 않고, 닮은 별들(공감 성단)만 곁에 둡니다 */
  const kinMode = Boolean(selectedId && kindred.anchorId === selectedId)
  const trace = useMemo(() => {
    if (!selectedId) return null
    if (kinMode) {
      const depthOf = new Map([[selectedId, 0]])
      const edges = []
      for (const id of kindred.ids) {
        depthOf.set(id, 1)
        edges.push({ a: selectedId, b: id, depth: 1 })
      }
      return { rootId: selectedId, depthOf, edges, maxDepth: 1 }
    }
    return traceFrom(graph.adj, selectedId, TRACE_DEPTH)
  }, [graph, selectedId, kinMode, kindred])
  const reach = useMemo(() => reachOf(trace, stars), [trace, stars])

  /**
   * 지금 어느 별 곁으로 무엇을 끌어올 것인가.
   * 잔별을 고르면 그 별의 1겹·2겹이 궤도로 모이고, 방금 띄운 직후라면
   * 닮은 마음들(공감 성단)이 모입니다.
   */
  const gather = useMemo(() => {
    const empty = {
      anchorId: null,
      ring1: [],
      ring2: [],
      radiusOf: () => ORBIT_FAR,
      r2: ORBIT_R2,
      clear: ANCHOR_CLEAR,
    }
    if (selectedId && trace && !kinMode) {
      const ring1 = []
      const ring2 = []
      for (const [id, depth] of trace.depthOf) {
        if (depth === 1) ring1.push(id)
        // 좁은 화면에서는 2겹을 곁으로 부르지 않습니다. 열두 개를 390×300 띠에
        // 욱여넣으면 별이 서로 포개져서, 정작 눌러야 할 1겹이 안 보여요.
        else if (depth === 2 && !isNarrow) ring2.push(id)
      }
      if (!ring1.length && !ring2.length) return empty
      // 닮은 만큼 가까이 — 가장 닮은 마음이 코앞에 섭니다
      ring1.sort((x, y) => graph.scoreOf(selectedId, y) - graph.scoreOf(selectedId, x))
      return {
        anchorId: selectedId,
        ring1,
        ring2,
        radiusOf: (id) => orbitRadiusFor(graph.scoreOf(selectedId, id)),
        r2: ORBIT_R2,
        clear: ANCHOR_CLEAR,
      }
    }
    if (kindred.anchorId) {
      return {
        anchorId: kindred.anchorId,
        ring1: kindred.ids,
        ring2: [],
        radiusOf: (id) => orbitRadiusFor(graph.scoreOf(kindred.anchorId, id) || 6),
        r2: ORBIT_R2,
        clear: ANCHOR_CLEAR,
      }
    }
    return empty
  }, [selectedId, trace, kindred, graph, isNarrow, kinMode])

  const showCard = Boolean(selected && cardOpen)
  /** 회고 시트를 접어둔 채 하늘을 보고 있는 상태 — 입력창은 그 손잡이 위로 */
  const barOnly = isNarrow && mineMode && !panelOpen && !showCard

  /**
   * 위아래에서 화면을 가리는 UI의 높이.
   * 이만큼 하늘의 중심을 옮겨야 별이 시트나 상단바 뒤에 숨지 않습니다.
   */
  const bottomInset = useMemo(() => {
    // 안내 카드가 아래를 덮고 있는 동안에는 그 위로 하늘을 올립니다
    if (!isNarrow) return tourInset
    const h = window.innerHeight
    if (showCard) return Math.min(h * 0.58, 520)
    if (mineMode && panelOpen) return h * 0.7
    if (mineMode) return 176 // 접힌 손잡이 + 그 위의 입력창
    return Math.max(84, tourInset)
  }, [isNarrow, showCard, mineMode, panelOpen, tourInset])

  const topInset = isNarrow ? 58 : 0

  /**
   * 넓은 화면에서 좌우가 가려지는 너비 — 왼쪽은 회고 패널, 오른쪽은 카드.
   * 세로로 시트에 가린 만큼 하늘을 위로 올리듯, 가로로도 똑같이 옮깁니다.
   * 둘 다 열려 있으면 서로 상쇄되어 하늘은 가운데 그대로 남습니다.
   */
  const rightInset = !isNarrow && showCard ? CARD_DOCK : 0
  const leftInset = !isNarrow && mineMode ? PANEL_DOCK : 0

  /**
   * 첫 화면 문구를 은하와 겹치지 않게 놓는 자리 (좁은 화면에서만).
   *
   * 은하는 화면 한가운데를 차지합니다. 그 위에 글자를 올리면 아무리 밝게 해도
   * 배경이 이겨요. 그래서 은하의 **실제 화면상 크기**를 재서 문구는 그 위로,
   * 안내는 그 아래로 비켜 세웁니다. 기울여 보고 있으니 세로는 sin(pitch)만큼 납작합니다.
   */
  const welcomeLayout = useMemo(() => {
    if (!isNarrow) return null
    const h = window.innerHeight
    const radiusPx = (GALAXY_RADIUS * FOCAL) / wholeGalaxy()
    const halfV = radiusPx * Math.sin(0.92)
    const skyCenter = h / 2 + (topInset - bottomInset) / 2
    return {
      textTop: Math.max(topInset + 78, skyCenter - halfV - 56),
      hintTop: Math.min(h - 172, skyCenter + halfV + 38),
    }
    // 웰컴은 전체 은하 시점에서만 보이므로 그때의 여백으로 계산하면 충분합니다
  }, [isNarrow, wholeGalaxy, topInset, bottomInset])

  /**
   * 반지름 radius의 무리가 (가려진 곳을 빼고) 화면에 들어오는 카메라 거리.
   *
   * `withCard`를 주는 이유: 별을 누르는 순간의 여백은 아직 카드가 열리기 **전**
   * 값입니다. 그걸로 계산하면 카드가 올라온 뒤 실제 띠는 200px쯤 좁아져 있어서,
   * 별무리가 시트 밖으로 밀려 나갔어요.
   */
  const fitDistance = useCallback(
    (radius, withCard = false) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const narrow = w <= 860
      const inset = withCard && narrow ? Math.min(h * 0.58, 520) : bottomInset
      // 데스크톱에서는 카드와 패널이 좌우를 차지하므로 그만큼 빼고 담는다
      const sides = narrow ? 32 : (withCard ? CARD_DOCK : 0) + (mineMode ? PANEL_DOCK : 0) + 48
      const usableW = w - sides
      const usableH = narrow ? h - inset - 90 : h - 150
      /* 좁은 화면 — 별무리를 **가로 폭을 기준으로** 넉넉히 펼칩니다.
         예전에는 짧은 쪽(시트 위에 남은 높이)에 맞춰서 반경이 110px에 머물렀고,
         곁으로 모인 별들이 붙어 있어 손가락으로 고르기 빠듯했어요.
         궤도는 기울여 보고 있어 세로로는 약 0.78배로 납작하므로, 높이는 그만큼 더 너그럽게 봅니다. */
      const margin = narrow
        ? Math.max(120, Math.min(usableW * 0.46, (usableH * 0.5) / 0.78))
        : Math.max(110, Math.min(usableW, usableH) * 0.42)
      return Math.max(340, Math.min(4600, distanceToFit(radius, margin)))
    },
    [bottomInset, mineMode]
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
      setShineOn(false) // 직접 고른 별 — '빛나는 별' 표시는 칩·이름표로 열었을 때만

      if (!id) {
        setSelectedId(null)
        setCardOpen(false)
        setReReading(null)
        return
      }

      const star = stars.find((s) => s.id === id)
      if (!star) return

      /* 카드를 여는 시점에 '전에 읽었는지'를 찍어 둡니다.
         읽음 표시는 잠시 뒤에 붙으므로, 그때 가서 물어보면 읽는 도중에
         "전에 읽었어요"가 나타나는 이상한 일이 생겨요. */
      const before = readMap.get(id)
      setReReading(before ? { id, at: before.lastAt || before.at } : null)

      // 이미 고른 별을 다시 누르면 카메라는 그대로 두고 카드만 다시 연다
      if (id === selectedId) {
        setCardOpen(true)
        return
      }

      setSelectedId(id)
      setCardOpen(true)
      setKinOrigin(null)
      if (isNarrow) setPanelOpen(false)

      let outer = ANCHOR_CLEAR
      if (star.authorId === me.id) {
        // 내 잔별 — 나와 닮은 하루를 보낸 다른 사람의 별들이 곁으로 모여듭니다
        const kin = findKindred(stars, star, KIN_COUNT)
        setKindred({ anchorId: id, ids: kin.map((s) => s.id) })
        for (const s of kin) outer = Math.max(outer, orbitRadiusFor(graph.scoreOf(id, s.id) || 6))
      } else {
        setKindred({ anchorId: null, ids: [] })
        const reached = traceFrom(graph.adj, id, TRACE_DEPTH)
        for (const [nid, depth] of reached.depthOf) {
          if (depth === 1) outer = Math.max(outer, orbitRadiusFor(graph.scoreOf(id, nid)))
          else if (depth === 2 && !isNarrow) outer = Math.max(outer, ORBIT_R2)
        }
      }

      setFocus({
        pos: star.pos, // 고른 별이 곧 화면의 중심
        dist: fitDistance(outer * 1.1, true),
        pitch: 0.82,
        hold: 14000,
        key: Date.now() + Math.random(),
      })
    },
    [stars, selectedId, graph, isNarrow, fitDistance, readMap, me]
  )

  const closeContact = useCallback(() => setContactOpen(false), [])

  /** 카드를 닫아도 줌인·궤도·연결은 그대로 남는다 */
  // 카드를 닫아도 지금 시점(내가 띄운 별 / 전체 은하)은 그대로 — 시점은 상단 탭으로만 바뀝니다
  const closeCard = useCallback(() => setCardOpen(false), [])

  /* 하늘에 닿지 못했을 때 — 별이 없는 것과 못 불러온 것은 다릅니다 */
  useEffect(() => {
    if (trouble) say('지금은 하늘에 닿지 못했어요. 잠시 뒤에 다시 열어주세요.')
  }, [trouble, say])

  /* ---------- 누군가 보내준 잔별을 열고 들어왔을 때 ----------
     /s/<id> 가 /?star=<id> 로 데려다줍니다. 하늘이 다 준비된 뒤에
     그 별 하나를 열어주고, 주소는 깨끗하게 지웁니다.
     (주소창에 남아 있으면 새로고침할 때마다 같은 별이 열려요) */
  const sharedOpened = useRef(false)
  useEffect(() => {
    if (!ready || sharedOpened.current) return
    const id = new URLSearchParams(window.location.search).get('star')
    if (!id) return
    sharedOpened.current = true

    if (stars.some((s) => s.id === id)) {
      setTourOpen(false) // 보러 온 별이 있는데 안내부터 띄우지 않습니다
      handleSelect(id)
    } else {
      say('그 잔별은 이미 하늘에서 내려갔어요')
    }
    window.history.replaceState(null, '', window.location.pathname)
  }, [ready, stars, handleSelect, say])

  /**
   * 카드를 잠깐 열어둔 것만으로 읽었다고 하지는 않습니다.
   * 스쳐 지나간 탭까지 길이 되면 지도가 거짓말을 하게 되니까요.
   *
   * 내 잔별도 길에 놓습니다. '나의 성단'에서 길이 **내 별에서 출발해야**
   * 내가 어느 이야기에서 시작해 어디까지 걸어갔는지가 보이니까요.
   */
  useEffect(() => {
    if (!cardOpen || !selected) return
    const t = setTimeout(() => markRead(selected.id), 1200)
    return () => clearTimeout(t)
  }, [cardOpen, selected, markRead])

  /** 별길 — 지금 하늘에 실제로 있는 잔별만, 읽은 순서 그대로 */
  const readTrail = useMemo(() => {
    const alive = new Set(stars.map((s) => s.id))
    return read.filter((r) => alive.has(r.id))
  }, [read, stars])

  /* ---------- 시점 전환 ---------- */

  /** 나의 성단으로 — 내 잔별들의 무게중심으로 카메라가 내려앉는다 */
  const enterMine = useCallback(() => {
    setShineOn(false)
    setWelcomeGone(true)
    setMineMode(true)
    // 좁은 화면에서는 먼저 내 별들의 모습만 — 목록은 아래 '내가 띄운 별'을 누르면 펼쳐집니다
    setPanelOpen(window.innerWidth > 860)
    setSelectedId(null)
    setCardOpen(false)
    const mine = constellation.mine
    if (mine.length === 0) {
      say('아직 띄운 잔별이 없어요. 한 줄만이라도 띄워보세요.')
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
    setShineOn(false)
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
    async ({ text, photo, allowFeature, firstChoice }) => {
      setWelcomeGone(true)
      setMineMode(false)
      setSelectedId(null)
      setCardOpen(false)
      let star
      try {
        // allowFeature 를 함께 넘깁니다 — 예전엔 여기서 빠져서, 쓸 때 체크한 '소개 동의'가 저장되지 않았어요
        star = await addStar({ text, photo, allowFeature })
        // 처음 띄우는 잔별 — 그때 고른 답을 '앞으로의 선택'으로 기억합니다 (다시 묻지 않도록)
        if (firstChoice !== undefined) setFeaturePref(firstChoice).catch(() => {})
      } catch (err) {
        // 서버가 막은 이유(도배 제한 등)가 있으면 그대로 보여줍니다
        const msg = err?.message && /[가-힣]/.test(err.message) ? err.message : '지금은 띄우지 못했어요. 잠시 뒤에 다시 해주세요.'
        say(msg, 3600)
        throw err // 입력창이 글을 지우지 않도록
      }
      const similar = findKindred(stars, star, KIN_COUNT)
      setKindred({ anchorId: star.id, ids: similar.map((s) => s.id) })
      // 내 별이 화면 가운데, 닮은 별들이 그 곁 궤도로 — 카드가 열린 뒤에도 보이게 맞춥니다
      setFocus({ pos: star.pos, dist: fitDistance(ORBIT_FAR * 1.15, true), pitch: 0.82, hold: 14000, key: Date.now() })
      say('잔별이 떠올랐어요. 닮은 하루를 보낸 별들이 곁으로 모여요.')
      setTimeout(() => {
        setSelectedId(star.id)
        setCardOpen(true)
      }, 950)
    },
    [addStar, stars, say, fitDistance, setFeaturePref]
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

  /* ---------- 불편한 별을 만났을 때 ---------- */

  // 신고·차단한 별은 하늘에서 바로 사라지므로, 열려 있던 카드도 함께 닫습니다
  const handleReport = useCallback(
    async (id, reason) => {
      await report(id, reason)
      closeCard()
    },
    [report, closeCard]
  )

  const handleBlock = useCallback(
    async (userId) => {
      await block(userId)
      closeCard()
    },
    [block, closeCard]
  )

  /** 내 별 하나 거두기 — 카드를 먼저 닫아야 사라지는 게 자연스럽습니다 */
  const handleRemoveStar = useCallback(
    async (id) => {
      closeCard()
      try {
        await removeStar(id)
        say('그 별을 거뒀어요.')
      } catch {
        say('지금은 하늘에 닿지 못했어요. 잠시 뒤에 다시 해주세요.')
      }
    },
    [removeStar, closeCard, say]
  )

  /* ---------- 첫 안내 ---------- */

  const demoStar = useMemo(() => pickDemoStar(stars, graph, me.id), [stars, graph, me.id])
  const demoId = demoStar?.id || null

  const wholeView = useCallback(
    () => ({ pos: { x: 0, y: 0, z: 0 }, dist: wholeGalaxy(), pitch: 0.92, hold: 0, key: Date.now() }),
    [wholeGalaxy]
  )

  /**
   * 장면마다 하늘이 스스로 움직입니다. 말로 설명하는 대신 보여주려고요.
   *   잔별   — 누군가의 성단으로 다가가 별 하나하나가 보이게
   *   읽기   — 그 별을 골라(카드는 열지 않음) 더 가까이, 온기의 파문이 번지게
   *   이어진 빛 — 한 걸음 물러나, 곁으로 모여든 닮은 마음들과 이어진 선이 다 보이게
   *   띄우기 — 다시 은하 전체
   *   나의 성단 — 실제로 '나의 성단' 시점을 켜고, 내 별들이 모인 자리로
   *   전체 은하 — 시점을 다시 끄고 은하 전체로
   * 저장된 좌표나 읽음 기록은 건드리지 않습니다.
   */
  useEffect(() => {
    if (!tourOpen || !tourStep || !ready) return
    const HOLD = 10 * 60 * 1000 // 안내를 읽는 동안 카메라가 제멋대로 돌아가지 않게
    const demo = stars.find((s) => s.id === demoId)

    const showing = tourStep === 'open' || tourStep === 'bond'
    if (!showing) setSelectedId(null)

    // '나의 성단' 장면에서만 실제로 그 시점을 켭니다 — 위의 버튼이 켜진 모습 그대로 보이게.
    // 좁은 화면에서는 회고 시트를 접어 둔 채(손잡이만) 하늘을 보여줍니다.
    const inMine = tourStep === 'mine'
    setMineMode(inMine)
    if (inMine) setPanelOpen(window.innerWidth > 860)

    if (tourStep === 'star' && demo) {
      setFocus({ pos: demo.pos, dist: fitDistance(520), pitch: 0.8, hold: HOLD, key: Date.now() })
      return
    }

    // '읽기'부터는 그 별을 실제로 골라 둡니다 — 고른 별의 고리가 켜지고, 닿은 별빛이 번져요
    if (showing && demo) {
      setSelectedId(demo.id)
      setCardOpen(false)
    }

    if (tourStep === 'open' && demo) {
      setFocus({ pos: demo.pos, dist: fitDistance(300), pitch: 0.76, hold: HOLD, key: Date.now() })
      return
    }

    if (tourStep === 'bond' && demo) {
      const reached = traceFrom(graph.adj, demo.id, TRACE_DEPTH)
      let outer = ANCHOR_CLEAR
      for (const [nid, depth] of reached.depthOf) {
        if (depth === 1) outer = Math.max(outer, orbitRadiusFor(graph.scoreOf(demo.id, nid)))
        else if (depth === 2 && !isNarrow) outer = Math.max(outer, ORBIT_R2)
      }
      setFocus({ pos: demo.pos, dist: fitDistance(outer * 1.1), pitch: 0.82, hold: HOLD, key: Date.now() })
      return
    }

    if (tourStep === 'mine' && constellation.mine.length) {
      const mine = constellation.mine
      const sum = mine.reduce((a, s) => ({ x: a.x + s.pos.x, y: a.y + s.pos.y, z: a.z + s.pos.z }), {
        x: 0,
        y: 0,
        z: 0,
      })
      const c = { x: sum.x / mine.length, y: sum.y / mine.length, z: sum.z / mine.length }
      const spread = Math.max(60, ...mine.map((s) => distance(s.pos, c)))
      setFocus({ pos: c, dist: fitDistance(spread * 1.6), pitch: 0.74, hold: HOLD, key: Date.now() })
      return
    }

    setFocus({ ...wholeView(), hold: HOLD })
    // tourInset이 바뀌면(카드 높이를 잰 뒤) 한 번 더 맞춥니다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen, tourStep, ready, demoId, tourInset, isNarrow])

  /* '읽고, 건네기' 장면 — 온기가 더해질 때 번지는 파문을 천천히 되풀이 */
  useEffect(() => {
    if (!tourOpen || tourStep !== 'open' || !demoId) return
    const pulse = () => setRipple({ id: demoId, key: Date.now() })
    const first = setTimeout(pulse, 900)
    const loop = setInterval(pulse, 2800)
    return () => {
      clearTimeout(first)
      clearInterval(loop)
    }
  }, [tourOpen, tourStep, demoId])

  /** 안내 다시 보기 — 지금 열려 있던 것들을 걷고 은하 전체에서 시작 */
  const openTour = useCallback(() => {
    setSelectedId(null)
    setCardOpen(false)
    setReReading(null)
    setMineMode(false)
    setKindred({ anchorId: null, ids: [] })
    setWelcomeGone(true)
    setTourStep(null)
    setTourOpen(true)
  }, [])

  /**
   * 안내를 마치는 네 갈래 — skip(건너뛰기) · done · read(별 하나 열어보기) · write(나의 이야기 쓰기)
   * 어느 쪽이든 '봤다'고 기록합니다. 다시 보고 싶으면 오른쪽 위 ? 가 있으니까요.
   */
  const finishTour = useCallback(
    (action) => {
      onboarding.markSeen()
      setTourOpen(false)
      setTourStep(null)
      setTourInset(0)
      setWelcomeGone(true)
      setSelectedId(null)
      setCardOpen(false)
      setMineMode(false)
      if (action === 'read' && demoId) {
        handleSelect(demoId)
        return
      }
      setFocus(wholeView())
    },
    [demoId, handleSelect, wholeView]
  )

  /** 오늘 가장 빛나는 별 보기 — 딱 한 별 */
  const showShining = useCallback(() => {
    if (!brightest) return
    handleSelect(brightest.id)
    setShineOn(true) // handleSelect가 끈 뒤에 다시 켭니다
  }, [brightest, handleSelect])


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
        rightInset={rightInset}
        leftInset={leftInset}
        initialDist={wholeGalaxy()}
        readTrail={readTrail}
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
          onHelp={openTour}
          onIntro={() => {
            setWelcomeGone(true)
            setIntroOpen(true)
          }}
          onMenuOpen={() => setWelcomeGone(true)} // 메뉴와 첫 문구가 겹치지 않게
        />

        {/* 전체 은하에서만 — 사람들의 마음이 가장 많이 머문 이야기로 바로 */}
        {ready && !mineMode && brightest && (
          <button
            className={`shinechip${shineOn && showCard ? ' on' : ''}`}
            type="button"
            onClick={() => {
              setWelcomeGone(true)
              showShining()
            }}
          >
            <span className="shinechip-star" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2.5c.6 4.6 2.3 7.3 9.5 9.5-7.2 2.2-8.9 4.9-9.5 9.5-.6-4.6-2.3-7.3-9.5-9.5 7.2-2.2 8.9-4.9 9.5-9.5z" />
              </svg>
            </span>
            오늘 가장 빛나는 별
          </button>
        )}

        {!welcomeGone && ready && !tourOpen && !introOpen && <Welcome gone={welcomeGone} layout={welcomeLayout} />}

        <div className="bottom">
          {ready && !tourOpen && !introOpen && !showCard && <TermsNotice />}
          <p className="creed">
            별거 아닌 줄 알았던 당신의 오늘이,
            <br />
            이곳에선 누군가의 밤을 비추는 잔별이 됩니다.
          </p>
          <Composer
            onSubmit={handleCreate}
            onFocus={() => setWelcomeGone(true)}
            compact={isNarrow}
            featurePref={featurePref}
          />
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
            readAt={reReading?.id === selected.id ? reReading.at : null}
            shine={shineOn && brightest?.id === selected.id}
            onWarm={handleWarm}
            onReply={handleReply}
            onReport={handleReport}
            onBlock={handleBlock}
            onNotice={say}
            onAllowFeature={setAllowFeature}
            kin={
              kinMode && selected.authorId === me.id
                ? kindred.ids.map((kid) => stars.find((s) => s.id === kid)).filter(Boolean)
                : null
            }
            backTo={kinOrigin && kinOrigin !== selected.id ? kinOrigin : null}
            onOpenStar={(kid) => {
              const from = selected.id
              handleSelect(kid)
              setKinOrigin(from)
            }}
            onBack={(mid) => handleSelect(mid)}
            onRemove={handleRemoveStar}
            onClose={closeCard}
          />
        )}
        {/* 카드 가장자리에 남는 별빛 — 세로 위치는 Galaxy가 고른 별의 높이에 맞춰 줍니다 */}
        {selected && <span className="cardnotch" aria-hidden="true" />}
      </div>

      {panelVisible && (
        <ConstellationPanel
          data={constellation}
          sheet={isNarrow}
          open={!isNarrow || panelOpen}
          onToggle={() => setPanelOpen((v) => !v)}
          // X는 목록만 접습니다. 전체 은하로는 상단 탭으로만 돌아가요
          onClose={isNarrow ? () => setPanelOpen(false) : null}
          onSelectStar={handleSelect}
          roadCount={readTrail.length}
          onContact={() => setContactOpen(true)}
          me={me}
          onNotice={say}
          featurePref={featurePref}
          onFeaturePref={setFeaturePref}
          onClearRoad={() => {
            clearRead()
            setReReading(null)
            say('별길을 지웠어요. 다시 처음부터 걸어도 돼요.')
          }}
        />
      )}

      <Toast message={toast} />

      {contactOpen && <ContactSheet onClose={closeContact} />}

      {introOpen && <IntroVideo onDone={() => setIntroOpen(false)} />}

      {tourOpen && ready && !introOpen && (
        <Tutorial
          narrow={isNarrow}
          reducedMotion={reducedMotion}
          onStep={setTourStep}
          onInset={setTourInset}
          onFinish={finishTour}
        />
      )}
    </>
  )
}
